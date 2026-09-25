import { useState } from 'react';

export function useSelection<T>(rows: T[] | undefined, getId: (row: T) => string) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const visible = new Set((rows ?? []).map(getId));
  const ids = [...selected].filter((id) => visible.has(id));
  return { selected, setSelected, ids, clear: () => setSelected(new Set()) };
}
