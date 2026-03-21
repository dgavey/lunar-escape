const fragShader = `
precision mediump float;

uniform sampler2D uMainSampler;
uniform float uTime;
uniform vec2 uTexSize;

varying vec2 outTexCoord;

void main() {
    vec4 color = texture2D(uMainSampler, outTexCoord);

    // Sample alpha in a ring to find edges
    vec2 texel = 1.0 / uTexSize;
    float glowAccum = 0.0;

    for (int i = 0; i < 20; i++) {
        float a = float(i) * 0.31415926; // 2*PI/20
        float wobble = 1.0 + 0.2 * sin(a * 3.0 + uTime * 3.5)
                           + 0.12 * sin(a * 5.0 - uTime * 5.0)
                           + 0.08 * sin(a * 7.0 + uTime * 2.0);
        float radius = 5.0 * wobble;
        vec2 offset = vec2(cos(a), sin(a)) * texel * radius;
        glowAccum += texture2D(uMainSampler, outTexCoord + offset).a;
    }
    glowAccum /= 20.0;

    // Outer glow — green shield aura
    float outerGlow = (1.0 - color.a) * glowAccum;

    // Pulsing intensity
    float pulse = 0.8 + 0.2 * sin(uTime * 2.5);

    vec3 glowColor = vec3(0.15, 1.0, 0.35) * pulse;

    color.rgb += glowColor * outerGlow * 1.8;
    color.a = max(color.a, outerGlow * 0.7);

    gl_FragColor = color;
}
`;

export default class ShieldGlowPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game) {
    super({
      game,
      name: 'ShieldGlow',
      fragShader,
    });
  }

  onPreRender() {
    this.set1f('uTime', this.game.loop.time / 1000);
  }

  onDraw(renderTarget) {
    this.set2f('uTexSize', renderTarget.width, renderTarget.height);
    this.bindAndDraw(renderTarget);
  }
}
