import { contentHash } from '../safeguards/hash.js';

/**
 * Metafield DEFINITIONS — schema, not values. Values are a separate entity
 * (one mutation per resource per metafield = lots of pagination) and live in
 * a future entities/metafield-values.js.
 *
 * Identity: (ownerType, namespace, key). Two definitions matching on that
 * tuple are considered "the same"; everything else is a content diff.
 *
 * Definitions can pin to many ownerType values (PRODUCT, COLLECTION, ORDER,
 * CUSTOMER, …). We list the ones we care about for the v1 spike — rest get
 * filled in once we have eyes on a real store.
 */
export const id = 'metafield-definitions';
export const label = 'Metafield definitions';

const OWNER_TYPES = [
  'PRODUCT',
  'PRODUCTVARIANT',
  'COLLECTION',
  'CUSTOMER',
  'ORDER',
  'COMPANY',
  'SHOP',
];

export async function extract(client) {
  const all = [];
  for (const ownerType of OWNER_TYPES) {
    let cursor = null;
    do {
      const { data } = await client.request(QUERY_LIST, {
        ownerType,
        cursor,
      });
      const conn = data?.metafieldDefinitions;
      if (!conn) break;
      for (const node of conn.nodes || []) {
        all.push(normalize(node));
      }
      cursor = conn.pageInfo?.hasNextPage ? conn.pageInfo.endCursor : null;
    } while (cursor);
  }
  return all;
}

export function planDiff({ source, target }) {
  // Index target by identity for O(1) lookup.
  const targetByKey = new Map(target.map((d) => [identity(d), d]));

  const create = [];
  const update = [];
  const skip = [];

  for (const def of source) {
    const key = identity(def);
    const existing = targetByKey.get(key);
    if (!existing) {
      create.push({
        key,
        summary: `${def.ownerType}  ${def.namespace}.${def.key}  (${def.type})  — “${def.name}”`,
        payload: def,
      });
      continue;
    }
    if (existing.hash === def.hash) {
      skip.push({ key, summary: key, reason: 'no diff' });
      continue;
    }
    update.push({
      key,
      summary: `${def.ownerType}  ${def.namespace}.${def.key}  — “${def.name}”`,
      before: existing,
      after: def,
      payload: def,
    });
  }

  // We deliberately do NOT propose destroys. Removing definitions from a
  // target store is a separate, more dangerous operation that needs its own
  // command and gating.
  return { create, update, skip, destroy: [] };
}

export async function apply({ client, plan, log }) {
  let created = 0;
  let updated = 0;

  for (const item of plan.create) {
    const def = item.payload;
    const { data } = await client.request(MUTATION_CREATE, {
      definition: toCreateInput(def),
    });
    const errs = data?.metafieldDefinitionCreate?.userErrors;
    if (errs?.length) {
      log.warn(`create ${item.key} failed: ${errs.map((e) => e.message).join('; ')}`);
      continue;
    }
    created += 1;
  }

  for (const item of plan.update) {
    const def = item.payload;
    const { data } = await client.request(MUTATION_UPDATE, {
      definition: toUpdateInput(def),
    });
    const errs = data?.metafieldDefinitionUpdate?.userErrors;
    if (errs?.length) {
      log.warn(`update ${item.key} failed: ${errs.map((e) => e.message).join('; ')}`);
      continue;
    }
    updated += 1;
  }

  return { created, updated };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function identity(def) {
  return `${def.ownerType}::${def.namespace}.${def.key}`;
}

function normalize(node) {
  const stable = {
    name: node.name,
    namespace: node.namespace,
    key: node.key,
    description: node.description ?? null,
    type: node.type?.name ?? node.type,
    ownerType: node.ownerType,
    pin: node.pinnedPosition !== null && node.pinnedPosition !== undefined,
    validations: (node.validations || [])
      .map((v) => ({ name: v.name, value: v.value }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
  return { ...stable, hash: contentHash(stable) };
}

function toCreateInput(def) {
  return {
    name: def.name,
    namespace: def.namespace,
    key: def.key,
    description: def.description,
    type: def.type,
    ownerType: def.ownerType,
    pin: def.pin,
    validations: def.validations,
  };
}

function toUpdateInput(def) {
  // Update mutation is keyed by ownerType+namespace+key; doesn't accept type
  // changes (Shopify forbids them). We pass the full input and let the API
  // reject any disallowed field.
  return toCreateInput(def);
}

const QUERY_LIST = /* GraphQL */ `
  query ListMetafieldDefinitions($ownerType: MetafieldOwnerType!, $cursor: String) {
    metafieldDefinitions(ownerType: $ownerType, first: 100, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        name
        namespace
        key
        description
        ownerType
        pinnedPosition
        type {
          name
        }
        validations {
          name
          value
        }
      }
    }
  }
`;

const MUTATION_CREATE = /* GraphQL */ `
  mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition {
        id
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

const MUTATION_UPDATE = /* GraphQL */ `
  mutation UpdateMetafieldDefinition($definition: MetafieldDefinitionUpdateInput!) {
    metafieldDefinitionUpdate(definition: $definition) {
      updatedDefinition {
        id
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;
