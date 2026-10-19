'use client';

import { useLayoutEffect, useRef } from 'react';
import type { CellProps, Column } from 'react-datasheet-grid';

export type Option = { value: string; label: string; archived?: boolean };

type SelectData = { options: Option[]; allowEmpty: boolean };

function SelectCell({
  rowData,
  setRowData,
  focus,
  active,
  stopEditing,
  columnData,
}: CellProps<string | null, SelectData>) {
  const ref = useRef<HTMLSelectElement>(null);
  const current = columnData.options.find((o) => o.value === rowData);

  useLayoutEffect(() => {
    if (focus) {
      ref.current?.focus();
      // Opens the native list right away, so one pick commits one change.
      try {
        ref.current?.showPicker?.();
      } catch {
        /* not allowed without a user gesture: the select still works */
      }
    } else {
      ref.current?.blur();
    }
  }, [focus]);

  return (
    <div className="relative flex h-full w-full items-center px-2">
      <span className={`truncate ${current ? '' : 'text-muted'}`}>
        {current?.label ?? ''}
      </span>
      <select
        ref={ref}
        value={rowData ?? ''}
        tabIndex={-1}
        aria-label="Escolher valor"
        onChange={(e) => {
          setRowData(e.target.value === '' ? null : e.target.value);
          stopEditing();
        }}
        onBlur={() => focus && stopEditing()}
        onKeyDown={(e) => e.key === 'Escape' && stopEditing()}
        style={{
          pointerEvents: focus ? 'auto' : 'none',
          opacity: focus ? 1 : 0,
        }}
        className="absolute inset-0 h-full w-full bg-surface px-1 text-sm"
      >
        {columnData.allowEmpty && <option value="">—</option>}
        {columnData.options
          .filter((o) => !o.archived || o.value === rowData)
          .map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
      </select>
      {active && !focus && (
        <span className="sr-only">Pressione Enter para editar</span>
      )}
    </div>
  );
}

export function selectColumn(
  options: Option[],
  allowEmpty: boolean,
): Partial<Column<string | null, SelectData, string>> {
  const labelOf = (v: string | null) =>
    options.find((o) => o.value === v)?.label ?? '';
  return {
    component: SelectCell as Column<
      string | null,
      SelectData,
      string
    >['component'],
    columnData: { options, allowEmpty },
    disableKeys: true,
    keepFocus: true,
    deleteValue: () => null,
    copyValue: ({ rowData }) => labelOf(rowData),
    // Pasting matches by label (case-insensitive); unknown text leaves the cell as it was.
    pasteValue: ({ rowData, value }) => {
      const text = value.trim().toLowerCase();
      if (!text) return allowEmpty ? null : rowData;
      return (
        options.find((o) => !o.archived && o.label.toLowerCase() === text)
          ?.value ?? rowData
      );
    },
  };
}
