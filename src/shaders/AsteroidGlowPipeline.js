const fragShader = `
precision mediump float;

uniform sampler2D uMainSampler;
uniform float uTime;
uniform vec2 uTexSize;

varying vec2 outTexCoord;

void main() {
    vec4 color = texture2D(uMainSampler, outTexCoord);

    // Brighten the dark rock
    color.rgb *= 1.8;

    // Sample alpha in a ring around this pixel to find edges
    vec2 texel = 1.0 / uTexSize;
    float glowAccum = 0.0;

    for (int i = 0; i < 20; i++) {
        float a = float(i) * 0.31415926; // 2*PI/20
        // Undulating radius — multiple overlapping sine waves
        float wobble = 1.0 + 0.25 * sin(a * 3.0 + uTime * 4.0)
                           + 0.15 * sin(a * 5.0 - uTime * 6.0)
                           + 0.10 * sin(a * 7.0 + uTime * 3.0);
        float radius = 4.0 * wobble;
        vec2 offset = vec2(cos(a), sin(a)) * texel * radius;
        glowAccum += texture2D(uMainSampler, outTexCoord + offset).a;
    }
    glowAccum /= 20.0;

    // Outer glow: pixels outside the shape but near the edge
    float outerGlow = (1.0 - color.a) * glowAccum;

    // Two-tone glow: orange core, yellow-orange fringe
    vec3 glowColor = mix(vec3(1.0, 0.4, 0.05), vec3(1.0, 0.65, 0.2), outerGlow);

    color.rgb += glowColor * outerGlow * 1.5;
    color.a = max(color.a, outerGlow * 0.8);

    gl_FragColor = color;
}
`;

export default class AsteroidGlowPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game) {
    super({
      game,
      fragShader,
    });
    this.padding = 8; // extra framebuffer space for glow bleed
  }

  onDraw(renderTarget) {
    this.set1f('uTime', this.game.loop.time / 1000);
    this.set2f('uTexSize', renderTarget.width, renderTarget.height);
    this.bindAndDraw(renderTarget);
  }
}
