/**
 * A small in-memory stand-in for the Prisma calls `ProfileEventsService` makes (LAB-3215 specs). It evaluates the
 * real `where` / `select` / `orderBy` / `distinct` / `take` arguments, so a spec fails when a filter in the service
 * goes missing, not only when a mocked return value changes.
 *
 * Supported: equality, `not`, `in`, `gt`, `gte`, `lt`, `lte`; `OR`, `AND`, `NOT`; to-one relation filters and
 * nested objects; `some` / `none` / `every` on to-many relations; `select` with nested `select`; `orderBy` on a field
 * or a to-one relation's field; `distinct`; `take`; `groupBy` with `by`.
 */

type Row = Record<string, any>;
type Relation = { model: string; local: string; foreign: string; many?: boolean };

export type InMemoryTables = {
  member?: Row[];
  pLEvent?: Row[];
  pLEventGuest?: Row[];
  pLEventAssociation?: Row[];
  teamMemberRole?: Row[];
  demoDay?: Row[];
  demoDayParticipant?: Row[];
};

const RELATIONS: Record<string, Record<string, Relation>> = {
  pLEventGuest: {
    member: { model: 'member', local: 'memberUid', foreign: 'uid' },
    event: { model: 'pLEvent', local: 'eventUid', foreign: 'uid' },
  },
  pLEventAssociation: { event: { model: 'pLEvent', local: 'eventUid', foreign: 'uid' } },
  demoDay: { participants: { model: 'demoDayParticipant', local: 'uid', foreign: 'demoDayUid', many: true } },
};

const OPERATORS = ['equals', 'not', 'in', 'gt', 'gte', 'lt', 'lte'];

function isPlainObject(value: unknown): value is Row {
  return !!value && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value);
}

function same(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    return a != null && b != null && new Date(a as any).getTime() === new Date(b as any).getTime();
  }
  return a === b;
}

function compare(a: unknown, b: unknown): number {
  const x = a instanceof Date ? a.getTime() : (a as any);
  const y = b instanceof Date ? b.getTime() : (b as any);
  return x < y ? -1 : x > y ? 1 : 0;
}

export class InMemoryPrisma {
  constructor(private tables: InMemoryTables) {}

  private rows(model: string): Row[] {
    return (this.tables as Record<string, Row[]>)[model] ?? [];
  }

  private related(model: string, row: Row, key: string): unknown {
    const relation = RELATIONS[model]?.[key];
    if (!relation) {
      return row[key];
    }
    const candidates = this.rows(relation.model).filter((other) => same(other[relation.foreign], row[relation.local]));
    return relation.many ? candidates : candidates[0] ?? null;
  }

  private modelOf(model: string, key: string): string {
    return RELATIONS[model]?.[key]?.model ?? `${model}.${key}`;
  }

  private matchesValue(value: unknown, filter: unknown): boolean {
    if (!isPlainObject(filter)) {
      return same(value, filter);
    }
    return Object.entries(filter).every(([op, arg]) => {
      switch (op) {
        case 'equals':
          return same(value, arg);
        case 'not':
          return !this.matchesValue(value, arg);
        case 'in':
          return (arg as unknown[]).some((item) => same(value, item));
        case 'gt':
          return value != null && compare(value, arg) > 0;
        case 'gte':
          return value != null && compare(value, arg) >= 0;
        case 'lt':
          return value != null && compare(value, arg) < 0;
        case 'lte':
          return value != null && compare(value, arg) <= 0;
        default:
          throw new Error(`InMemoryPrisma: unsupported operator ${op}`);
      }
    });
  }

  matches(model: string, row: Row | null, where: Row | undefined): boolean {
    if (!where) return true;
    if (!row) return false;
    return Object.entries(where).every(([key, filter]) => {
      if (filter === undefined) return true;
      if (key === 'OR') return (filter as Row[]).some((part) => this.matches(model, row, part));
      if (key === 'AND') return [filter].flat().every((part: Row) => this.matches(model, row, part));
      if (key === 'NOT') return ![filter].flat().some((part: Row) => this.matches(model, row, part));
      const value = this.related(model, row, key);
      if (Array.isArray(value) && isPlainObject(filter)) {
        const child = this.modelOf(model, key);
        if ('some' in filter) return value.some((item) => this.matches(child, item, filter.some));
        if ('none' in filter) return !value.some((item) => this.matches(child, item, filter.none));
        if ('every' in filter) return value.every((item) => this.matches(child, item, filter.every));
      }
      if (isPlainObject(filter) && !Object.keys(filter).some((op) => OPERATORS.includes(op))) {
        return this.matches(this.modelOf(model, key), value as Row | null, filter);
      }
      return this.matchesValue(value, filter);
    });
  }

  private project(model: string, row: Row | null, select: Row | undefined): Row | null {
    if (!row) return null;
    if (!select) return { ...row };
    const out: Row = {};
    for (const [key, spec] of Object.entries(select)) {
      if (!spec) continue;
      const value = this.related(model, row, key);
      if (isPlainObject(spec) && spec.select) {
        const child = this.modelOf(model, key);
        out[key] = Array.isArray(value)
          ? value.map((item) => this.project(child, item, spec.select))
          : this.project(child, value as Row | null, spec.select);
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  private sortKey(model: string, row: Row, orderBy: Row): { value: unknown; direction: string } {
    const [key, spec] = Object.entries(orderBy)[0];
    if (typeof spec === 'string') return { value: row[key], direction: spec };
    return this.sortKey(this.modelOf(model, key), this.related(model, row, key) as Row, spec);
  }

  findMany(model: string, args: Row = {}): Row[] {
    let found = this.rows(model).filter((row) => this.matches(model, row, args.where));
    if (args.orderBy) {
      const orders = [args.orderBy].flat();
      found = [...found].sort((a, b) => {
        for (const order of orders) {
          const x = this.sortKey(model, a, order);
          const y = this.sortKey(model, b, order);
          const result = compare(x.value, y.value) * (x.direction === 'desc' ? -1 : 1);
          if (result) return result;
        }
        return 0;
      });
    }
    if (args.distinct) {
      const seen = new Set<string>();
      found = found.filter((row) => {
        const key = JSON.stringify(args.distinct.map((field: string) => row[field]));
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    if (args.take !== undefined) found = found.slice(0, args.take);
    return found.map((row) => this.project(model, row, args.select) as Row);
  }

  groupBy(model: string, args: Row): Row[] {
    const groups = new Map<string, Row>();
    for (const row of this.rows(model).filter((item) => this.matches(model, item, args.where))) {
      const picked = Object.fromEntries(args.by.map((field: string) => [field, row[field]]));
      groups.set(JSON.stringify(picked), picked);
    }
    return [...groups.values()];
  }

  /** The delegates the service calls. No jest globals here: this file is inside the build's type check. */
  delegate(model: string) {
    return {
      findMany: async (args?: Row) => this.findMany(model, args),
      findUnique: async (args: Row) => this.findMany(model, { ...args, take: 1 })[0] ?? null,
      findFirst: async (args: Row) => this.findMany(model, { ...args, take: 1 })[0] ?? null,
      groupBy: async (args: Row) => this.groupBy(model, args),
    };
  }

  client() {
    return {
      member: this.delegate('member'),
      pLEvent: this.delegate('pLEvent'),
      pLEventGuest: this.delegate('pLEventGuest'),
      pLEventAssociation: this.delegate('pLEventAssociation'),
      teamMemberRole: this.delegate('teamMemberRole'),
      demoDay: this.delegate('demoDay'),
    };
  }
}
