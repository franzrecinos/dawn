import * as metafieldDefinitions from './metafield-definitions.js';

const entities = {
  [metafieldDefinitions.id]: metafieldDefinitions,
  metafields: metafieldDefinitions, // friendly alias for the v1 spike
};

export function getEntity(name) {
  const entity = entities[name];
  if (!entity) {
    throw new Error(
      `Unknown entity "${name}". Available: ${Object.keys(entities).join(', ')}`
    );
  }
  return entity;
}

export function listEntities() {
  return Object.keys(entities);
}
