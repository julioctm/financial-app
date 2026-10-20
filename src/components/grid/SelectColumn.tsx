'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CellProps, Column } from 'react-datasheet-grid';

import { asUnmatched, isUnmatched, unmatchedText } from '@/lib/unmatched';

export type Option = { value: string; label: string; archived?: boolean };

type SelectData = { options: Option[]; allowEmpty: boolean };

const EMPTY_LABEL = '— (vazio)';
const normalize = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Spreadsheet-style dropdown cell:
//  - Enter (or typing) opens it; typing filters; ArrowUp/Down move the highlight;
//  - however editing ends (Enter, Tab, arrows to another cell, clicking away) the highlighted
//    option is applied. Esc cancels. This mirrors how the text cells commit.
function SelectCell({
  rowData,
  setRowData,
  focus,
  active,
  stopEditing,
  columnData,
}: CellProps<string | null, SelectData>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const touched = useRef(false); // the user typed or moved the highlight
  const escaped = useRef(false); // Esc was pressed: do not apply
  const firstRender = useRef(true);

  const unmatched = isUnmatched(rowData);
  const current = columnData.options.find((o) => o.value === rowData);

  const list = useMemo(() => {
    const visible = columnData.options.filter(
      (o) => !o.archived || o.value === rowData,
    );
    const q = normalize(query);
    const matches = q
      ? visible.filter((o) => normalize(o.label).includes(q))
      : visible;
    return columnData.allowEmpty && !q
      ? [{ value: '', label: EMPTY_LABEL }, ...matches]
      : matches;
  }, [columnData, query, rowData]);

  // Latest values for the effect that runs when editing ends.
  const latest = useRef({ list, highlight });
  latest.current = { list, highlight };

  useLayoutEffect(() => {
    if (focus) {
      escaped.current = false;
      touched.current = false;
      setQuery('');
      const start = latest.current.list.findIndex((o) => o.value === rowData);
      setHighlight(start >= 0 ? start : 0);
      if (inputRef.current) {
        setRect(inputRef.current.getBoundingClientRect());
        inputRef.current.focus();
        inputRef.current.select();
      }
    } else if (!firstRender.current) {
      const { list: l, highlight: h } = latest.current;
      if (!escaped.current && touched.current && l[h]) {
        setRowData(l[h].value === '' ? null : l[h].value);
      }
    }
    firstRender.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  useLayoutEffect(() => {
    listRef.current?.children[highlight]?.scrollIntoView({ block: 'nearest' });
  }, [highlight, focus]);

  const label = unmatched
    ? `⚠ ${unmatchedText(rowData)}`
    : (current?.label ?? '');

  return (
    <div className="relative flex h-full w-full items-center px-2">
      <span
        className={`truncate ${
          unmatched ? 'text-negative' : current ? '' : 'text-muted'
        }`}
        title={unmatched ? 'Não encontrado nos cadastros' : undefined}
        style={{ visibility: focus ? 'hidden' : 'visible' }}
      >
        {label}
      </span>

      <input
        ref={inputRef}
        value={query}
        tabIndex={-1}
        role="combobox"
        aria-label="Escolher valor"
        aria-expanded={focus}
        aria-controls="grid-select-list"
        aria-activedescendant={focus ? `grid-opt-${highlight}` : undefined}
        placeholder={current?.label ?? ''}
        onChange={(e) => {
          touched.current = true;
          setQuery(e.target.value);
          setHighlight(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            // Keep the arrows for the list; the grid must not move to another cell.
            e.preventDefault();
            // The grid listens on `document`, where React's own root listener also lives, so
            // plain stopPropagation is not enough: stop the grid's listener explicitly.
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            touched.current = true;
            setHighlight((h) =>
              e.key === 'ArrowDown'
                ? Math.min(h + 1, Math.max(list.length - 1, 0))
                : Math.max(h - 1, 0),
            );
          } else if (e.key === 'Escape') {
            escaped.current = true;
          }
        }}
        style={{
          pointerEvents: focus ? 'auto' : 'none',
          opacity: focus ? 1 : 0,
        }}
        className="absolute inset-0 h-full w-full bg-surface px-2 text-sm outline-none"
      />

      {focus &&
        rect &&
        createPortal(
          <ul
            ref={listRef}
            id="grid-select-list"
            role="listbox"
            style={{
              position: 'fixed',
              top: rect.bottom + 2,
              left: rect.left,
              minWidth: Math.max(rect.width, 160),
              maxHeight: 240,
              zIndex: 60,
            }}
            className="overflow-y-auto rounded-lg border border-line-strong bg-surface py-1 text-sm shadow-lg"
          >
            {list.length === 0 && (
              <li className="px-3 py-1.5 text-muted">Nenhum resultado</li>
            )}
            {list.map((o, i) => (
              <li
                key={o.value || 'empty'}
                id={`grid-opt-${i}`}
                role="option"
                aria-selected={i === highlight}
                onMouseDown={(e) => {
                  // mousedown (not click) so the input keeps focus until we decide
                  e.preventDefault();
                  escaped.current = true;
                  setRowData(o.value === '' ? null : o.value);
                  stopEditing();
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`cursor-pointer px-3 py-1.5 ${
                  i === highlight ? 'bg-accent-tint text-accent-ink' : ''
                } ${o.value === '' ? 'text-muted' : ''}`}
              >
                {o.label}
              </li>
            ))}
          </ul>,
          document.body,
        )}

      {active && !focus && (
        <span className="sr-only">Pressione Enter para escolher</span>
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
    // Keys stay with the grid (Enter/Tab/Esc end editing; arrows are handled by the cell).
    disableKeys: false,
    keepFocus: false,
    deleteValue: () => null,
    copyValue: ({ rowData }) =>
      isUnmatched(rowData) ? unmatchedText(rowData) : labelOf(rowData),
    // Pasting matches by label (case-insensitive). Text that matches nothing is kept as an
    // "unmatched" marker so the grid can say what was not found instead of dropping it.
    pasteValue: ({ rowData, value }) => {
      const text = value.trim().toLowerCase();
      if (!text) return allowEmpty ? null : rowData;
      const found = options.find(
        (o) => !o.archived && o.label.toLowerCase() === text,
      );
      return found?.value ?? asUnmatched(value);
    },
  };
}
