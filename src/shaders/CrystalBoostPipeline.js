const fragShader = `
precision mediump float;

uniform sampler2D uMainSampler;
uniform float uTime;

varying vec2 outTexCoord;

void main() {
    vec4 color = texture2D(uMainSampler, outTexCoord);

    if (color.a < 0.01) {
        gl_FragColor = color;
        return;
    }

    // Override toward crystal light blue — use luminance to preserve shading
    float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    vec3 crystalColor = vec3(0.45, 0.85, 1.0) * lum * 2.0;
    color.rgb = mix(color.rgb, crystalColor, 0.85);

    // Diagonal shine — moves top-left to bottom-right
    // pos goes from 0 (top-left) to 2 (bottom-right)
    float pos = outTexCoord.x + outTexCoord.y;
    // Shine position cycles every 1.2 seconds across the diagonal
    float shinePos = fract(uTime / 1.2) * 3.0 - 0.5;
    float shine = 1.0 - smoothstep(0.0, 0.25, abs(pos - shinePos));

    color.rgb += vec3(0.8, 0.95, 1.0) * shine * 0.7 * color.a;

    gl_FragColor = color;
}
`;

export default class CrystalBoostPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game) {
    super({
      game,
      name: 'CrystalBoost',
      fragShader,
    });
  }

  onPreRender() {
    this.set1f('uTime', this.game.loop.time / 1000);
  }

  onDraw(renderTarget) {
    this.bindAndDraw(renderTarget);
  }
}
