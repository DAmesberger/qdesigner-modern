export type FilterOperator = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'between' | 'in';

export interface FilterRule {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
  /** Second value for 'between' operator */
  value2?: string;
}

export interface FilterGroup {
  id: string;
  logic: 'AND' | 'OR';
  rules: FilterRule[];
}

export interface FilterQuery {
  groups: FilterGroup[];
  logic: 'AND' | 'OR';
}
