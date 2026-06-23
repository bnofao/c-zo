import type {
  Column,
  RowData,
  Table as TanstackTable,
} from '@tanstack/react-table'
import { flexRender } from '@tanstack/react-table'
import { Button } from '@workspace/ui/components/button'
import { NativeSelect, NativeSelectOption } from '@workspace/ui/components/native-select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { cn } from '@workspace/ui/lib/utils'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react'
import * as React from 'react'

// Per-column escape hatch for header/cell styling (width, alignment) without
// threading className through every consumer.
declare module '@tanstack/react-table' {
  // eslint-disable-next-line unused-imports/no-unused-vars -- TValue is part of the augmented signature
  interface ColumnMeta<TData extends RowData, TValue> {
    headerClassName?: string
    cellClassName?: string
  }
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50]

/** Sortable column header — drop into a column def's `header`. Inert when the column can't sort. */
export function DataTableColumnHeader<TData, TValue>({ column, title, className }: {
  column: Column<TData, TValue>
  title: React.ReactNode
  className?: string
}) {
  if (!column.getCanSort())
    return <span className={className}>{title}</span>

  const sorted = column.getIsSorted()
  const Icon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ChevronsUpDown
  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      className={cn('inline-flex items-center gap-1.5', sorted ? 'text-foreground' : 'text-muted-foreground hover:text-foreground', className)}
    >
      {title}
      <Icon className={cn('size-3.5', sorted ? 'opacity-100' : 'opacity-40')} />
    </button>
  )
}

/**
 * Grid renderer: takes a `@tanstack/react-table` instance the consumer builds
 * (client-side or `manual*` server-driven) and renders it through the shared
 * `Table` primitives. Pagination is a separate component so cursor-based
 * (relay) and offset-based footers can both drive the same grid.
 */
export function DataTable<TData>({ table, emptyMessage }: {
  table: TanstackTable<TData>
  emptyMessage?: React.ReactNode
}) {
  const colCount = table.getAllLeafColumns().length
  const rows = table.getRowModel().rows

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map(group => (
            <TableRow key={group.id}>
              {group.headers.map(header => (
                <TableHead key={header.id} colSpan={header.colSpan} className={header.column.columnDef.meta?.headerClassName}>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length
            ? rows.map(row => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id} className={cell.column.columnDef.meta?.cellClassName}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : (
                <TableRow>
                  <TableCell colSpan={colCount} className="h-24 text-center text-sm text-muted-foreground">
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              )}
        </TableBody>
      </Table>
    </div>
  )
}

export interface DataTablePaginationLabels {
  previous: string
  next: string
  perPage: (count: number) => string
}

/**
 * Prop-driven pagination footer: page-size picker + prev/next. The consumer owns
 * navigation state (works for relay cursors as well as offset pages). All copy
 * is passed in, so i18n stays with the consumer.
 */
export function DataTablePagination({
  pageSize,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  onPageSizeChange,
  canPrevious,
  canNext,
  onPrevious,
  onNext,
  summary,
  labels,
}: {
  pageSize: number
  pageSizeOptions?: number[]
  onPageSizeChange: (size: number) => void
  canPrevious: boolean
  canNext: boolean
  onPrevious: () => void
  onNext: () => void
  summary?: React.ReactNode
  labels: DataTablePaginationLabels
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {summary ? <p className="text-xs text-muted-foreground">{summary}</p> : null}
        <NativeSelect size="sm" value={String(pageSize)} onChange={e => onPageSizeChange(Number(e.target.value))}>
          {pageSizeOptions.map(n => (
            <NativeSelectOption key={n} value={n}>{labels.perPage(n)}</NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={!canPrevious} onClick={onPrevious}>
          <ChevronLeft />
          {labels.previous}
        </Button>
        <Button variant="outline" size="sm" disabled={!canNext} onClick={onNext}>
          {labels.next}
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}
