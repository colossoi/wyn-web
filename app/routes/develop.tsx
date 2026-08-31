import type { Route } from "./+types/develop";
import { Link } from "react-router";
import defaultImageSource from "~/playground/examples/default.wyn?raw";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Shader development · Wyn Playground" },
    {
      name: "description",
      content: "How to write, run, inspect, and share Wyn playground shaders.",
    },
  ];
}

const inputs = [
  ["iResolution", "vec3f32", "Framebuffer width, height, and pixel aspect ratio (currently 1.0)."],
  ["iTime", "f32", "Seconds elapsed since the shader started, excluding paused time."],
  ["iTimeDelta", "f32", "Seconds since the preceding rendered frame."],
  ["iFrameRate", "f32", "Current frame rate, calculated as 1 / iTimeDelta."],
  ["iFrame", "i32", "Rendered frame number, beginning at zero."],
  ["iChannelTime", "[4]f32", "Channel playback times. These are zero until channels are supported."],
  ["iChannelResolution", "[4]vec3f32", "Channel dimensions. These are zero until channels are supported."],
  ["iMouse", "vec4f32", "Pointer position in xy and click position/state in zw, in framebuffer pixels."],
  ["iDate", "vec4f32", "Local year, month, day, and seconds since midnight."],
  ["iSampleRate", "f32", "Audio sample rate; currently 44,100 Hz."],
  ["frag_coord", "vec2f32", "The current pixel position in framebuffer coordinates."],
] as const;

export default function DevelopRoute() {
  return (
    <main className="develop-page">
      <article className="develop-content">
        <header className="develop-hero">
          <div className="develop-eyebrow">Wyn Playground</div>
          <h1>Shader development</h1>
          <p>
            Write an ordinary Wyn function. The playground supplies live inputs,
            builds the fullscreen graphics pipeline, compiles it to WGSL, and runs
            it with WebGPU.
          </p>
          <div className="develop-actions">
            <Link to="/new" reloadDocument className="develop-action-primary">
              Write a shader
            </Link>
            <a href="/spec/" className="develop-action-secondary">
              Read the language specification
            </a>
          </div>
        </header>

        <section>
          <h2 id="main-image">The <code>main_image</code> contract</h2>
          <p>
            Every playground shader defines one function named <code>main_image</code>.
            Each invocation computes the color of one pixel and returns that color
            as a four-component RGBA vector. This is the same role played by a
            fragment shader in WGSL or GLSL: the GPU runs it independently across
            all fragments covered by the image.
          </p>
          <p>
            Playground shader source is intentionally not a complete Wyn program.
            The playground combines your function with a hidden Wyn framework that
            draws a fullscreen triangle, rasterizes it, and calls <code>main_image</code>
            for every covered pixel. You write the per-pixel computation while the
            framework supplies the graphics-pipeline entry and resource plumbing.
          </p>
          <p>
            The playground can also provide live metadata such as the framebuffer
            size, elapsed time, frame number, mouse state, and current pixel
            coordinate. Request a value by adding its recognized name and exact
            type to <code>main_image</code>. Parameters may appear in any order, and
            you only declare the values your shader needs.
          </p>
          <pre><code>{defaultImageSource}</code></pre>
          <p>
            See the specification chapters on{" "}
            <a href="/spec/declaring-functions-and-values.html">functions and values</a>,{" "}
            <a href="/spec/expressions.html">expressions</a>, and{" "}
            <a href="/spec/vector-types.html">vector types</a>.
          </p>
        </section>

        <section>
          <h2 id="inputs">Available inputs</h2>
          <p>
            These are the names and types the playground recognizes. It matches
            the parameters in your <code>main_image</code> signature against this
            table and connects each requested value to the corresponding browser
            or GPU state. A misspelled name or incorrect type is reported as a
            playground source error.
          </p>
          <div className="develop-table-wrap">
            <table className="develop-table">
              <thead><tr><th>Name</th><th>Type</th><th>Value</th></tr></thead>
              <tbody>
                {inputs.map(([name, type, description]) => (
                  <tr key={name}>
                    <td><code>{name}</code></td>
                    <td><code>{type}</code></td>
                    <td>{description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Coordinates and mouse state</h3>
          <p>
            <code>frag_coord</code> and mouse coordinates use framebuffer pixels with the origin
            at the bottom left. While the primary pointer button is held,
            <code>iMouse.xy</code> is the current position and <code>iMouse.zw</code>
            is the positive click position. After release, zw becomes negative.
            All four components are zero before the first click.
          </p>
        </section>

        <section>
          <h2 id="pipeline">What the playground generates</h2>
          <p>
            Your source is inserted into a private wrapper containing a fullscreen
            triangle, its vertex function, and an <code>image</code> pipeline entry.
            The fragment callback calls <code>main_image</code> with exactly the
            arguments you requested.
          </p>
          <div className="develop-flow" aria-label="Playground compilation flow">
            <span>User <code>main_image</code></span><b>→</b>
            <span>hidden Wyn wrapper</span><b>→</b>
            <span>Wyn compiler</span><b>→</b>
            <span>WGSL + WebGPU</span>
          </div>
          <p>
            The wrapper uses Wyn’s regular graphics operations: a direct draw,
            triangle rasterization, and fragment shading. Their language semantics
            are described in{" "}
            <a href="/spec/unified-pipeline-entries-and-stage-invocation.html">
              Unified Pipeline Entries and Stage Invocation
            </a>{" "}
            and <a href="/spec/external-resources.html">External Resources</a>.
          </p>
        </section>

        <section>
          <h2 id="workflow">Compile, inspect, and debug</h2>
          <ul>
            <li>Choose <strong>Compile &amp; Run</strong> or press <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Enter</kbd>.</li>
            <li>Compiler diagnostics refer to your editor lines; hidden-wrapper locations are not exposed as user source.</li>
            <li>Pause and restart the animation with the preview controls, or use fullscreen for a larger framebuffer.</li>
            <li>Open <strong>Pipeline</strong> to inspect generated entry points and resource bindings.</li>
            <li>Use the <strong>TLC</strong>, <strong>MIR</strong>, and <strong>WGSL</strong> output tabs to see the compiler’s intermediate and final output.</li>
          </ul>
          <p>
            Rendering requires a browser with WebGPU support. Compilation can
            still report source errors before a render pipeline is created.
          </p>
        </section>

        <section>
          <h2 id="saving">Save and share</h2>
          <p>
            Anyone can edit and run a shader locally in the page. Sign in with
            GitHub to save. A saved shader stores your <code>main_image</code> source,
            title, and a preview thumbnail, then receives a public URL. Only the
            owner can update it; viewing a shared shader does not require an account.
          </p>
        </section>

        <aside className="develop-next">
          <h2>Go deeper</h2>
          <p>
            The playground provides the image pipeline; the Wyn specification is
            the source of truth for everything you can write inside it.
          </p>
          <a href="/spec/">Open the complete Wyn Language Specification →</a>
        </aside>
      </article>
    </main>
  );
}
