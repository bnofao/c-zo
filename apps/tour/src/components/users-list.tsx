import type { ColumnDef, OnChangeFn, SortingState } from '@tanstack/react-table'
import type { UserRow, UserTab } from '../server/users.server'
import type { UsersQueryParams } from './users-query'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { useTolgee, useTranslate } from '@tolgee/react'
import { Avatar, AvatarFallback } from '@workspace/ui/components/avatar'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { DataTable, DataTableColumnHeader, DataTablePagination } from '@workspace/ui/components/data-table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu'
import { Input } from '@workspace/ui/components/input'
import { cn } from '@workspace/ui/lib/utils'
import { MoreHorizontal, Plus, Search } from 'lucide-react'
import * as React from 'react'
import { errorCode } from '../graphql/admin-error'
import { can } from '../lib/rbac'
import { csvRoles, targetOutranksActor } from '../lib/role-delegation'
import { resendInvitation } from '../server/users.server'
import { useRoleLabel } from './role-labels'
import { UserBanDialog } from './user-ban-dialog'
import { UserCreateDialog } from './user-create-dialog'
import { UserRolesDialog } from './user-roles-dialog'
import {
  roleHierarchiesQueryOptions,
  USER_DEFAULT_PAGE_SIZE,
  USER_PAGE_SIZE_OPTIONS,
  USER_TABS,
  userCountsQueryOptions,
  usersQueryOptions,
} from './users-query'

type TFn = ReturnType<typeof useTranslate>['t']

const SEARCH_DEBOUNCE_MS = 300

const usersRouteApi = getRouteApi('/_authed/users')

function initials(name: string, email: string): string {
  const base = name?.trim() || email
  return base.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase()
}

function StatusCell({ user, t }: { user: UserRow, t: TFn }) {
  if (!user.emailVerified && !user.banned)
    return <span className="text-muted-foreground">—</span>
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {user.emailVerified
        ? (
            <Badge variant="secondary">
              <span className="size-1.5 rounded-full bg-primary" />
              {t('users.status.verified')}
            </Badge>
          )
        : null}
      {user.banned
        ? (
            <Badge variant="destructive">
              <span className="size-1.5 rounded-full bg-destructive" />
              {t('users.status.banned')}
            </Badge>
          )
        : null}
    </div>
  )
}

interface RowCaps { setRole: boolean, ban: boolean, create: boolean }

function RowMenu({ user, caps, meId, outranksMe, t, onRoles, onBan, onActivate, onResend }: {
  user: UserRow
  caps: RowCaps
  meId: string
  outranksMe: (targetRole: string) => boolean
  t: TFn
  onRoles: () => void
  onBan: () => void
  onActivate: () => void
  onResend: () => void
}) {
  // The API rejects acting on yourself (CannotBanSelf), so never offer ban on
  // your own row. Resend targets unverified invitees only. If nothing is
  // available, render no trigger at all.
  const isSelf = user.id === meId
  // Editing your own roles stays available (self-onboarding into new domains);
  // for others, the delegated-admin guard refuses anyone who outranks you in a
  // shared domain — hide the action instead of surfacing the API error.
  const canRoles = caps.setRole && (isSelf || !outranksMe(user.role))
  // Show resend only while the user has no login account yet — i.e. an invited
  // user who hasn't accepted (set a password). Once any account exists, hide it.
  const canResend = caps.create && user.accounts.length === 0
  const canBanToggle = caps.ban && !isSelf

  if (!canRoles && !canResend && !canBanToggle)
    return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={t('users.actions.label')} />}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {canRoles ? <DropdownMenuItem onClick={onRoles}>{t('users.actions.changeRole')}</DropdownMenuItem> : null}
        {canResend ? <DropdownMenuItem onClick={onResend}>{t('users.actions.resendInvite')}</DropdownMenuItem> : null}
        {canBanToggle
          ? (
              <>
                {canRoles || canResend ? <DropdownMenuSeparator /> : null}
                {user.banned
                  ? <DropdownMenuItem onClick={onActivate}>{t('users.actions.activate')}</DropdownMenuItem>
                  : <DropdownMenuItem variant="destructive" onClick={onBan}>{t('users.actions.deactivate')}</DropdownMenuItem>}
              </>
            )
          : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface UserColumnHandlers {
  onRoles: (user: UserRow) => void
  onBan: (user: UserRow) => void
  onActivate: (user: UserRow) => void
  onResend: (user: UserRow) => void
}

function useUserColumns(
  t: TFn,
  dateFmt: Intl.DateTimeFormat,
  roleLabel: (token: string) => string,
  caps: RowCaps,
  handlers: UserColumnHandlers,
  meId: string,
  outranksMe: (targetRole: string) => boolean,
): ColumnDef<UserRow>[] {
  return React.useMemo(() => [
    {
      id: 'name',
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('common.col.name')} />,
      cell: ({ row }) => {
        const u = row.original
        return (
          <div className="flex items-center gap-3">
            <Avatar className="size-9">
              <AvatarFallback className="text-xs">{initials(u.name, u.email)}</AvatarFallback>
            </Avatar>
            <div className="leading-tight">
              <div className="font-medium">{u.name}</div>
              <div className="text-xs text-muted-foreground">{u.email}</div>
            </div>
          </div>
        )
      },
    },
    {
      id: 'role',
      header: () => t('users.col.role'),
      cell: ({ row }) => (
        <div className="flex flex-wrap items-center gap-1.5">
          {(row.original.role ? row.original.role.split(',').map(s => s.trim()).filter(Boolean) : []).map(r => (
            <Badge key={r} variant="outline">{roleLabel(r)}</Badge>
          ))}
        </div>
      ),
      enableSorting: false,
    },
    {
      id: 'status',
      header: () => t('users.col.status'),
      cell: ({ row }) => <StatusCell user={row.original} t={t} />,
      enableSorting: false,
    },
    {
      id: 'createdAt',
      accessorKey: 'createdAt',
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('users.col.createdAt')} />,
      cell: ({ row }) => <span className="text-muted-foreground">{dateFmt.format(new Date(row.original.createdAt))}</span>,
    },
    {
      id: 'actions',
      header: () => null,
      cell: ({ row }) => (
        <RowMenu
          user={row.original}
          caps={caps}
          meId={meId}
          outranksMe={outranksMe}
          t={t}
          onRoles={() => handlers.onRoles(row.original)}
          onBan={() => handlers.onBan(row.original)}
          onActivate={() => handlers.onActivate(row.original)}
          onResend={() => handlers.onResend(row.original)}
        />
      ),
      enableSorting: false,
      meta: { headerClassName: 'w-12', cellClassName: 'text-right' },
    },
  ], [t, dateFmt, roleLabel, caps, handlers, meId, outranksMe])
}

// react-table column id → the API's server-sortable field.
function orderFieldFor(columnId: string | undefined): UsersQueryParams['orderField'] {
  return columnId === 'createdAt' ? 'CREATED_AT' : 'NAME'
}

export function UsersList() {
  const { t } = useTranslate()
  const { me } = usersRouteApi.useRouteContext()
  const qc = useQueryClient()
  const roleLabel = useRoleLabel()
  const lang = useTolgee(['language']).getLanguage() ?? 'en'
  // Pin to UTC so the SSR (server, UTC) and client (local tz) renders agree.
  const dateFmt = React.useMemo(() => new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeZone: 'UTC' }), [lang])

  const [creating, setCreating] = React.useState(false)
  const [rolesUser, setRolesUser] = React.useState<UserRow | null>(null)
  const [banAction, setBanAction] = React.useState<{ type: 'ban' | 'activate', user: UserRow } | null>(null)
  const [notice, setNotice] = React.useState<{ kind: 'ok' | 'err', text: string } | null>(null)

  const caps: RowCaps = {
    create: can(me, 'user', 'create'),
    setRole: can(me, 'user', 'set-role'),
    ban: can(me, 'user', 'ban'),
  }

  // Seniority gate (delegated-admin guard): a row whose user outranks me in a
  // shared domain gets no role-change action at all.
  const { data: hierarchies = [] } = useQuery(roleHierarchiesQueryOptions())
  const outranksMe = React.useCallback(
    (targetRole: string) => targetOutranksActor(hierarchies, csvRoles(me.role), csvRoles(targetRole)),
    [hierarchies, me.role],
  )

  const onResend = async (user: UserRow) => {
    setNotice(null)
    try {
      await resendInvitation({ data: { id: user.id } })
      setNotice({ kind: 'ok', text: t('users.resend.sent') })
    }
    catch (e) {
      setNotice({ kind: 'err', text: errorCode(e) ? t(`users.error.${errorCode(e)}`) : t('users.error.generic') })
    }
  }

  const handlers: UserColumnHandlers = {
    onRoles: setRolesUser,
    onBan: user => setBanAction({ type: 'ban', user }),
    onActivate: user => setBanAction({ type: 'activate', user }),
    onResend,
  }

  const columns = useUserColumns(t, dateFmt, roleLabel, caps, handlers, me.id, outranksMe)

  const [searchInput, setSearchInput] = React.useState('')
  const [search, setSearch] = React.useState<string | null>(null)
  const [tab, setTab] = React.useState<UserTab>('all')
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'name', desc: false }])
  const [pageSize, setPageSize] = React.useState(USER_DEFAULT_PAGE_SIZE)
  // Cursor stack: one `after` cursor per visited page (`null` = first page).
  const [cursors, setCursors] = React.useState<(string | null)[]>([null])
  const searchTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const resetToFirstPage = () => setCursors([null])

  const onSearchChange = (value: string) => {
    setSearchInput(value)
    setNotice(null)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setSearch(value.trim() || null)
      resetToFirstPage()
    }, SEARCH_DEBOUNCE_MS)
  }

  const onTab = (next: UserTab) => {
    setTab(next)
    setNotice(null)
    resetToFirstPage()
  }

  const onSortingChange: OnChangeFn<SortingState> = (updater) => {
    setSorting(prev => (typeof updater === 'function' ? updater(prev) : updater))
    resetToFirstPage()
  }

  const onPageSizeChange = (size: number) => {
    setPageSize(size)
    resetToFirstPage()
  }

  const sort = sorting[0]
  const params: UsersQueryParams = {
    first: pageSize,
    after: cursors[cursors.length - 1] ?? null,
    search,
    tab,
    orderField: orderFieldFor(sort?.id),
    orderDirection: sort?.desc ? 'DESC' : 'ASC',
  }

  const { data, isFetching } = useQuery({
    ...usersQueryOptions(params),
    placeholderData: keepPreviousData,
  })
  // Global per-tab totals — fetched once, unaffected by search/pagination/tab.
  const { data: counts } = useQuery(userCountsQueryOptions())

  const rows = data?.rows ?? []
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange,
    manualSorting: true,
    manualPagination: true,
    manualFiltering: true,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
  })

  const onNext = () => {
    if (data?.hasNextPage && data.endCursor != null)
      setCursors(s => [...s, data.endCursor])
  }
  const onPrevious = () => setCursors(s => (s.length > 1 ? s.slice(0, -1) : s))

  const pageIndex = cursors.length - 1
  const from = rows.length === 0 ? 0 : pageIndex * pageSize + 1
  const to = pageIndex * pageSize + rows.length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t('users.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('users.subtitle')}</p>
        </div>
        {caps.create
          ? (
              <Button onClick={() => setCreating(true)}>
                <Plus />
                {t('users.create')}
              </Button>
            )
          : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex gap-1 rounded-lg bg-muted p-1 text-muted-foreground">
          {USER_TABS.map(k => (
            <button
              key={k}
              type="button"
              onClick={() => onTab(k)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                tab === k ? 'bg-background text-foreground shadow-sm' : 'hover:text-foreground',
              )}
            >
              {t(`users.tabs.${k}`)}
              {counts
                ? (
                    <span className="rounded-full bg-muted-foreground/15 px-1.5 text-xs tabular-nums">
                      {counts[k]}
                    </span>
                  )
                : null}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-60">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={searchInput} onChange={e => onSearchChange(e.target.value)} placeholder={t('users.search')} className="pl-8" />
        </div>
      </div>

      {notice
        ? <p className={notice.kind === 'ok' ? 'text-sm text-primary' : 'text-sm text-destructive'}>{notice.text}</p>
        : null}

      <DataTable table={table} emptyMessage={t('users.empty')} />

      <DataTablePagination
        pageSize={pageSize}
        pageSizeOptions={USER_PAGE_SIZE_OPTIONS}
        onPageSizeChange={onPageSizeChange}
        canPrevious={pageIndex > 0 && !isFetching}
        canNext={Boolean(data?.hasNextPage) && !isFetching}
        onPrevious={onPrevious}
        onNext={onNext}
        summary={rows.length > 0 ? t('users.pagination.range', { from, to }) : undefined}
        labels={{
          previous: t('users.pagination.prev'),
          next: t('users.pagination.next'),
          perPage: count => t('users.pagination.perPage', { count }),
        }}
      />

      <UserCreateDialog open={creating} onOpenChange={setCreating} onCreated={() => qc.invalidateQueries({ queryKey: ['users', 'counts'] })} />
      <UserRolesDialog user={rolesUser} onOpenChange={o => !o && setRolesUser(null)} />
      <UserBanDialog action={banAction} onOpenChange={o => !o && setBanAction(null)} />
    </div>
  )
}
