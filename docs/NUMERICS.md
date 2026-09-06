# FluxLab numerical method and limitations

This document specifies the implemented method. It is not a statement of full Fluent equivalence or general engineering validation. The executable tests in `tests/` are the authority for the verification claims reported here.

## 1. Governing approximation and representation

FluxLab implements an isothermal, weakly compressible D2Q9 lattice Boltzmann method for low-Mach, nominally incompressible laminar flow. The distributions evolve on a square, uniform two-dimensional lattice. There is no pressure-Poisson solve, energy equation, turbulence closure, or third spatial dimension.

At each node, store nine particle populations f_q, density rho, and velocity u=(ux,uy). The lattice directions, in the exact implementation order, are:

```text
q        0    1    2    3    4    5    6    7    8
cx       0    1    0   -1    0    1   -1   -1    1
cy       0    0    1    0   -1    1    1   -1   -1
opposite 0    3    4    1    2    7    8    5    6
weight  4/9  1/9  1/9  1/9  1/9  1/36 1/36 1/36 1/36
```

The lattice sound speed squared is cs² = 1/3. Equilibrium is the second-order polynomial

```text
feq_q(rho,u) = w_q rho [1 + 3(c_q·u) + 4.5(c_q·u)² - 1.5(u·u)]
rho = sum_q f_q
rho u = sum_q c_q f_q
```

Background: the author-maintained [LiterateLB](https://literatelb.org/) describes lattice-Boltzmann discretization, collision, boundary rules, and implementation. The expressions above specify this implementation; not all methods described by that reference are implemented here.

## 2. Time-step ordering

Both CPU and GPU use the same ordering:

1. Each fluid node pulls the q population from the adjacent upstream node at x-c_q, or applies link bounce-back when that source is solid.
2. The left/right open-boundary populations are reconstructed when applicable.
3. Density and momentum are summed from the streamed / reconstructed populations.
4. The macroscopic field is written as `[ux, uy, rho, solidMarker]`.
5. TRT or BGK collision writes the outgoing populations to the destination buffer.
6. Source and destination exchange roles.

The GPU stores populations in structure-of-arrays order `q * nodeCount + nodeIndex`. Each invocation owns one destination node. No atomics or inter-invocation barriers are required because all population reads come from the previous buffer. Dispatch ordering and buffer usage dependencies are submitted through WebGPU.

The macroscopic field is the pre-collision moment of the current streamed populations. Collision ideally conserves those moments, subject to finite precision.

## 3. Collision

Let g denote the streamed and boundary-reconstructed population. With opposite direction o(q):

```text
fout_q = g_q
         - omega_plus/2  [g_q + g_o - feq_q - feq_o]
         - omega_minus/2 [g_q - g_o - feq_q + feq_o]
```

For TRT, the even relaxation time controls viscosity and the odd relaxation time is derived from a fixed magic parameter:

```text
tau_plus  = 0.5 + 3 nu_lattice
omega_plus = 1 / tau_plus
Lambda = 3/16
tau_minus = 0.5 + Lambda / (tau_plus - 0.5)
omega_minus = 1 / tau_minus
```

For BGK, set `omega_minus = omega_plus`; the expression reduces algebraically to single-relaxation-time collision. A chosen TRT parameter is not a universal stability or curved-wall-accuracy guarantee. No entropic, cumulant, MRT-matrix, Smagorinsky, forcing, or positivity-preserving collision model is implemented. The parameter structure reserves a force slot, but it is zero and unused.

## 4. Boundaries

### Solid walls

Bodies are rasterized by point-in-polygon tests at lattice-node coordinates. The solid mask is 0 for fluid, 1 for stationary solid, and 2 for the moving top lid. A pull link whose source node is solid reads the local opposite population:

```text
g_q(x) = f_opposite(q)(x)
```

The numerical no-slip surface lies halfway along the fluid/solid link. A smooth overlay is only a display outline. Curved and oblique numerical boundaries are stair-stepped and differ from the ideal geometry by a grid-dependent amount. No interpolated curved-wall scheme or body-fitted mesh is present.

For the moving lid, with horizontal lattice velocity U_lid:

```text
g_q(x) += 6 w_q rho_local cx_q U_lid
```

`rho_local` is recovered from the previous local distributions. Cavity corner nodes are stationary; top interior solid nodes carry marker 2. Stored solid-node velocities remain zero because they are masks, not fluid solution nodes; the moving-wall velocity enters through reflection.

### Velocity inlet

At the left boundary of tunnel mode, prescribed horizontal velocity is U and vertical velocity is zero. Unknown eastbound populations are reconstructed:

```text
rho = [g0 + g2 + g4 + 2(g3 + g6 + g7)] / (1-U)
g1 = g3 + 2 rho U/3
g5 = g7 + (g4-g2)/2 + rho U/6
g8 = g6 + (g2-g4)/2 + rho U/6
```

The parabolic option uses `U(y) = U_reference * 4 t (1-t)`, with `t=(y-0.5)/(ny-2)`. The reference speed is therefore the nominal centerline peak, **not** the mean channel speed. At periodic lateral boundaries, use a uniform profile for an unconstrained external-flow approximation; the parabolic expression is designed around the no-slip wall placement.

### Pressure outlet

At the right boundary of tunnel mode, rho_out=1 and vertical velocity is constrained to zero:

```text
U = -1 + g0 + g2 + g4 + 2(g1 + g5 + g8)
g3 = g1 - 2U/3
g7 = g5 + (g2-g4)/2 - U/6
g6 = g8 + (g4-g2)/2 - U/6
```

This is a fixed-reference-pressure boundary, not an adjustable physical-pressure input or a nonreflecting outlet. Backflow and a wake too close to the outlet can degrade or destabilize a result. Use an adequately long downstream domain and check sensitivity.

The inlet/outlet reconstruction follows the non-equilibrium bounce-back approach of Q. Zou and X. He, [On pressure and velocity flow boundary conditions and bounceback for the lattice Boltzmann BGK model](https://arxiv.org/abs/comp-gas/9611001). The paper's accuracy results apply to its studied configurations; they are not automatically verification results for FluxLab.

### Periodic and cavity modes

Y neighbor indices wrap. Stationary top/bottom mask rows intercept those links in no-slip configurations. Fully periodic mode also wraps X and disables open-boundary reconstruction. Cavity mode places stationary side/bottom walls and a moving top wall; it has no inlet or outlet.

## 5. SI-to-lattice mapping

Inputs: requested domain length L, height H, column count nx, physical reference velocity U_phys, physical density rho_ref, dynamic viscosity mu, and selected lattice reference velocity U_lattice.

```text
ny         = round((nx-1) H/L) + 1
dx         = L/(nx-1)
H_actual   = (ny-1) dx
dt         = U_lattice dx / U_phys
nu_phys    = mu / rho_ref
nu_lattice = nu_phys dt / dx²
tau_plus   = 0.5 + 3 nu_lattice
```

H_actual is reported because rounding ny preserves square lattice spacing instead of forcing unequal X/Y cell dimensions. The nominal no-slip channel's fluid-to-wall geometry also depends on half-link wall placement. Recompute and check the intended physical geometry after refinement.

Converted results:

```text
u_phys = u_lattice dx/dt
p_gauge = (rho_lattice - 1) rho_ref (dx/dt)² / 3
time_phys = iteration dt
Mach_lattice = sqrt(3) max(|u_lattice|)
```

Gauge pressure is relative to lattice density 1. It is not absolute pressure. Density fluctuations are intrinsic to this weakly compressible method. No speed-of-sound calibration to a real compressible fluid is attempted.

The displayed Reynolds number uses the **first body's width** as reference length, or requested domain height if there are no bodies. For polygons, this width is metadata and may not be the desired hydraulic diameter. For a parabolic inlet, Reynolds number uses peak velocity. It is a setup indicator, not automatic physical regime classification or turbulence-model selection.

The accepted reference lattice speed is 0.005–0.09 and tau_plus is 0.505–3. These are implementation bounds, not sufficient stability conditions. Invalid combinations are rejected; mu is never silently changed. At fixed U_lattice, refining dx decreases dt and increases nu_lattice / tau_plus. A message suggesting refinement or a speed change must be interpreted according to these equations, especially at the upper tau limit.

## 6. Diagnostics and stopping

Between snapshots separated by delta_n lattice steps, the velocity temporal-change metric is

```text
R_ux = sqrt(mean_fluid((ux_now-ux_previous)²)) / (U_lattice delta_n)
R_uy = sqrt(mean_fluid((uy_now-uy_previous)²)) / (U_lattice delta_n)
R_rho = sqrt(mean_fluid((rho_now-rho_previous)²)) / delta_n
```

These measure average field change per step over the snapshot interval. Snapshot cadence can affect the interpretation; oscillating fields can alias. They are not per-equation algebraic residuals and must not be compared numerically to Fluent's scaled residual settings.

Optional temporal stopping requires both velocity metrics below the threshold for eight accepted checks spaced at least 100 iterations apart, after iteration 1000. It does not require a separate mass-balance threshold and is not a proof of correctness. Unsteady flows may appropriately never satisfy it.

The inlet/outlet display sums rho*ux on sampled edge fluid nodes (excluding corner rows) and reports their relative mismatch. This is a useful tunnel-flow diagnostic. It omits transient storage and is **not** the discrete conservation residual; it is not meaningful as an inlet/outlet budget for a closed cavity or a fully periodic domain. Exact finite-volume-style flux budgets and moving-wall momentum-exchange force integration are not implemented.

A health check pauses after a snapshot if any fluid macroscopic value is nonfinite, density leaves [0.5,1.5], or maximum lattice velocity exceeds 0.30. This is an emergency guard, not an accuracy criterion. It runs at snapshot cadence, not inside every GPU step, so a batch may already contain unstable results before the stop is observed.

## 7. Postprocessing

Scalar fields: speed, ux, uy, gauge pressure, and Z vorticity. Vorticity uses centered two-neighbor differences divided by `2*dt`; dx cancels against the velocity scale. At domain edges, neighbor coordinates are clamped, not replaced by a specialized one-sided or periodic derivative. Near solids, the stored mask-node velocity is zero. Boundary-adjacent vorticity is therefore a visualization estimate, not a high-order wall-shear measurement.

The GPU renderer bilinearly interpolates scalar samples and colors them using a piecewise-linear palette. CPU Canvas 2D uses a rasterized palette image with image smoothing. Their visual interpolation is not pixel-identical. The color ramp is not part of the numerical solver.

Streamlines are integrated through the current sampled velocity field with a normalized-direction RK2 step and bilinear velocity sampling; they stop at solids / domain bounds. They are instantaneous streamline approximations, not transient pathlines. Passive particles use RK2 advection with the sampled velocity and iteration advance. They have no mass, inertia, collision model, or fluid feedback and are intended for visualization. They are not a Lagrangian discrete-phase model.

Probes report the nearest lattice node and identify solid hits. Probe CSV describes the current snapshot, not a continuously stored probe time series. Field CSV and VTK export all nodes, including a solid mask; velocity and gauge pressure use SI units. VTK uses a 2D structured point dataset with a singleton Z dimension. CSV/VTK do not store populations and cannot restart a simulation.

## 8. Precision, memory and execution

CPU distributions and macroscopic fields are Float32 arrays; intermediate JavaScript arithmetic is normally double precision before storing. GPU WGSL arithmetic is f32. Floating-point reassociation / fused operations can produce divergence in long trajectories even when both paths are correct. Bitwise CPU/GPU equivalence is not expected.

Approximate persistent GPU field storage per node: two nine-population buffers (72 bytes), one mask (4 bytes), one macro field (16 bytes), and one staging readback field (16 bytes): **108 bytes per node**, excluding uniforms, JavaScript arrays, command objects, browser allocations, and image buffers. A one-million-node mesh is a significant allocation, not a guarantee of interactive performance.

The solver submits bounded batches and applies queue-completion backpressure. GPU readback is asynchronous and single-flight. The GPU scalar renderer avoids CPU upload of the solution field, but geometric overlays and scientific diagnostics still do CPU work; the entire application is not zero-copy or GPU-only. CPU fallback runs in a worker when possible, otherwise yields once per step on the main thread.

Device loss restarts the case on the CPU from initial conditions. It does **not** migrate lost distribution populations. Definition edits also restart; there is no dynamic remeshing state transfer.

## 9. What has and has not been established

See [VALIDATION.md](VALIDATION.md) and the executable tests. Equilibrium moments, periodic stationarity, one analytical shear-decay configuration for each collision operator, a cavity sanity / mass-drift check, inlet/outlet reconstruction, model validation, serialization, and the worker protocol were tested. None establishes general aerodynamic-force accuracy, a specific drag/lift coefficient, mesh independence, long-time stability for all examples, or GPU portability.

The build environment did not expose a WebGPU adapter. The WGSL implementation and browser parity test are supplied, but their device execution is explicitly unverified in the recorded build.

## References

- Q. Zou and X. He, pressure / velocity and bounce-back boundary conditions: https://arxiv.org/abs/comp-gas/9611001
- Author-maintained lattice-Boltzmann exposition and implementation: https://literatelb.org/
- WebGPU specification, buffer usage / queue and pipeline semantics: https://www.w3.org/TR/webgpu/
- WGSL specification: https://www.w3.org/TR/WGSL/
- Browser API availability and secure-context requirement: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API

References describe the underlying methods and APIs. Implementation-specific behavior and limits above are derived from the accompanying source code.
