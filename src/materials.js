const MATERIAL_OVERRIDES = [
  {
    match: /dach/i,
    style: { color: '#353b42', roughness: 0.72, metalness: 0.02 }
  },
  {
    match: /keramzytobeton/i,
    style: { color: '#d9d3c7', roughness: 0.9, metalness: 0 }
  },
  {
    match: /beton|concrete/i,
    style: { color: '#aaa59b', roughness: 0.86, metalness: 0 }
  },
  {
    match: /lammi|szary/i,
    style: { color: '#777a78', roughness: 0.8, metalness: 0 }
  }
];

export function getMaterialOverride(name = '') {
  const override = MATERIAL_OVERRIDES.find(({ match }) => match.test(name));
  return override ? { ...override.style } : null;
}

export function getColorOverride(hexColor = '') {
  const normalizedColor = hexColor.toLowerCase();

  if (normalizedColor === '#787878') {
    return { color: '#353b42', roughness: 0.72, metalness: 0.02 };
  }

  if (normalizedColor === '#808080') {
    return { color: '#aaa59b', roughness: 0.86, metalness: 0 };
  }

  if (normalizedColor === '#c0c0c0') {
    return { color: '#d9d3c7', roughness: 0.9, metalness: 0 };
  }

  return null;
}
