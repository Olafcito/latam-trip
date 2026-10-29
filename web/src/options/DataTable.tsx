import type { KeyboardEvent } from 'react'
import { cellKind, ratingBand, type Column, type Sort } from '../data/dash'
import { thousands } from '../lib/format'

interface Props<T extends { id: string }> {
  columns: Column[]
  rows: T[]
  sort: Sort
  onSort(key: string): void
  /** the row whose airports are shown on the map */
  picked?: string | null
  onPick?(row: T): void
  /** what one row is, for the empty line: "trips" */
  noun: string
}

const NUMERIC = new Set(['rate', 'n1', 'kr', 'int'])

function cellText(kind: string, v: unknown): string {
  if (v == null || v === '') return ''
  switch (kind) {
    case 'rate':
    case 'n1':
      return Number(v).toFixed(1)
    case 'kr':
      return Number(v) ? thousands(Number(v)) : ''
    case 'int':
      return Number(v) ? String(v) : ''
    default:
      return String(v)
  }
}

/** One table: sticky header, every header sorts, numbers right aligned, one fact per cell. */
export function DataTable<T extends { id: string }>({ columns, rows, sort, onSort, picked, onPick, noun }: Props<T>) {
  const pickable = !!onPick
  const onKey = (e: KeyboardEvent<HTMLTableRowElement>, row: T) => {
    if (!onPick || (e.key !== 'Enter' && e.key !== ' ')) return
    e.preventDefault()
    onPick(row)
  }
  return (
    <div className="tbl-wrap">
      <table className={`tbl${pickable ? ' pick' : ''}`}>
        <thead>
          <tr>
            {columns.map((c) => {
              const kind = cellKind(c.key)
              const active = sort.key === c.key
              const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={ariaSort}
                  className={`${NUMERIC.has(kind) ? 'num' : ''}${c.group ? ' grp' : ''}${active ? ' on' : ''}`}
                >
                  <button type="button" className="th-btn" onClick={() => onSort(c.key)}>
                    <span>{c.label}</span>
                    <span className="th-arrow" aria-hidden="true">{active ? (sort.dir === 'asc' ? '▴' : '▾') : ''}</span>
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const r = row as unknown as Record<string, unknown>
            const isPicked = picked === row.id
            return (
              <tr
                key={row.id}
                className={isPicked ? 'picked' : undefined}
                aria-selected={pickable ? isPicked : undefined}
                tabIndex={pickable ? 0 : undefined}
                onClick={pickable ? () => onPick!(row) : undefined}
                onKeyDown={pickable ? (e) => onKey(e, row) : undefined}
              >
                {columns.map((c) => {
                  const kind = cellKind(c.key)
                  const v = r[c.key]
                  const text = cellText(kind, v)
                  const cls = `${kind}${c.group ? ' grp' : ''}`
                  if (kind === 'rate') {
                    const n = Number(v)
                    return (
                      <td key={c.key} className={`${cls} num`}>
                        <span className={`rate ${Number.isFinite(n) ? ratingBand(n) : ''}`}>{text}</span>
                      </td>
                    )
                  }
                  return (
                    <td key={c.key} className={`${cls}${NUMERIC.has(kind) ? ' num' : ''}`} title={kind === 'wrap' && text.length > 80 ? text : undefined}>
                      {text}
                    </td>
                  )
                })}
              </tr>
            )
          })}
          {!rows.length && (
            <tr className="empty-row">
              <td colSpan={columns.length}>No {noun} match these filters.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
