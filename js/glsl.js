// Shared GLSL for the pool interior, water and water feature.

export const COMMON = /* glsl */ `
#define TAU 6.28318530718

float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1,0)), u.x),
             mix(hash12(i + vec2(0,1)), hash12(i + vec2(1,1)), u.x), u.y);
}

// Tileable water caustic (after Dave Hoskins / joltz0r).
float caustic(vec2 uv, float time){
  vec2 p = mod(uv * TAU, TAU) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = .005;
  for (int n = 0; n < 4; n++){
    float t = time * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}

// Two caustic layers at different scales so the pattern never visibly repeats.
vec3 caustics(vec2 p, float time){
  vec2 q = p * 0.42;
  float r = caustic(q + vec2(0.003, 0.0), time);
  float g = caustic(q, time);
  float b = caustic(q - vec2(0.003, 0.0), time);
  float g2 = caustic(q * 0.61 + 3.7, time * 0.73);
  return clamp(vec3(r, g, b) * 0.7 + g2 * 0.45, 0.0, 2.5);
}
`;
