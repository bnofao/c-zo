# c-zo UI (@workspace/ui)

The component kit for c-zo's admin surfaces — shadcn/ui on **Base UI** primitives,
**Nova** preset, Tailwind CSS v4. Components ship sensible base styles, expose
**variants** for their looks, and take a `className` you extend for layout.

## Setup

No provider or theme context is required — components render on their own. The one
requirement is that `styles.css` is loaded: it defines the design tokens (CSS custom
properties on `:root`, with a `.dark` set for dark mode), pulls in the Nova base
styles, and loads the Geist font. The palette ships **light and dark** — dark mode
activates under a `.dark` class on an ancestor.

## Styling idiom — variants first, semantic tokens always

Pick the look with **variants**, not class overrides; use `className` for **layout**
(width, spacing, grid), not to recolor or restyle:

- **`Button`** — `variant`: `default` (primary), `secondary`, `outline`, `ghost`,
  `destructive`, `link`. `size`: `sm`, `default`, `lg`, `icon`. Built on Base UI's
  Button; to render as another element use `render={<a … />}` and add
  `nativeButton={false}`.
- **`Badge`** — `variant`: `default`, `secondary`, `destructive`, `outline`.

For anything brand-colored that isn't a variant, use the **semantic token utilities**
— never raw palette colors (`bg-blue-600`):

| Surface / text | Utilities |
|---|---|
| App background / text | `bg-background` / `text-foreground` |
| Card surface | `bg-card` / `text-card-foreground` |
| Primary | `bg-primary` / `text-primary-foreground` |
| Secondary / muted | `bg-secondary` / `bg-muted` / `text-muted-foreground` |
| Accent | `bg-accent` / `text-accent-foreground` |
| Destructive | `bg-destructive` |
| Border / ring | `border` + `border-border`, `ring-ring` |

## The components

- **`Button`**, **`Badge`** — see variants above.
- **`Input`** — full-width bordered `<input>`; pair with a `<label>`.
- **`Card`** — use the full composition: `Card` > `CardHeader` (`CardTitle`,
  `CardDescription`, `CardAction`) / `CardContent` / `CardFooter`. Don't dump
  everything in one div.
- **`Table`** — `Table` > `TableHeader`/`TableBody`/`TableFooter` with
  `TableRow` > `TableHead` (header cells) / `TableCell` (body cells); `TableCaption`
  optional.
- **`Separator`** — `orientation="horizontal"` (default) or `"vertical"`; use it
  instead of an `<hr>` or a bordered div.
- **`Avatar`** — `Avatar` > `AvatarImage` + `AvatarFallback` (always include a
  fallback for when the image fails).
- **`Breadcrumb`** — `Breadcrumb` > `BreadcrumbList` > `BreadcrumbItem` with
  `BreadcrumbLink` / `BreadcrumbPage` (current), `BreadcrumbSeparator` between.
- **`Collapsible`** — `Collapsible` > `CollapsibleTrigger` + `CollapsibleContent`;
  `defaultOpen` for the expanded state.
- **`Skeleton`** — a pulsing placeholder `<div>`; size it with `className`
  (`h-4 w-3/4`, `size-10 rounded-full`). Use instead of custom `animate-pulse`.
- **`DropdownMenu`**, **`Sheet`**, **`Tooltip`** — overlay/menu primitives (Base UI
  `render`-prop composition: `DropdownMenuTrigger render={<Button />}`). Items live
  inside their group (`DropdownMenuGroup`); `Tooltip` needs a `TooltipProvider`
  ancestor.

### Forms & controls

- **`Label`** — pair with a control via `htmlFor`, or wrap the control for inline
  checkbox/switch/radio rows.
- **`Checkbox`**, **`Switch`** — `defaultChecked` / `checked`; compose inside a `Label`.
- **`RadioGroup`** > `RadioGroupItem value=…`; root takes `defaultValue`.
- **`Textarea`** — multi-line input, mirrors `Input` styling.
- **`NativeSelect`** > `NativeSelectOption` (+ `NativeSelectOptGroup`) — a styled
  native `<select>`; use `Select` (below) for the rich popover variant.
- **`InputGroup`** > `InputGroupInput`/`InputGroupTextarea` with `InputGroupAddon`
  (icons, prefixes, buttons). Never put a raw `Input` inside `InputGroup`.
- **`ButtonGroup`** — segments adjacent `Button`s; `ButtonGroupSeparator`/`ButtonGroupText`.
- **`Toggle`** (single, `defaultPressed`) / **`ToggleGroup`** > `ToggleGroupItem value=…`
  (`defaultValue` is an array — Base UI multiple by default).

### Layout & display

- **`Tabs`** > `TabsList` > `TabsTrigger value=…` + `TabsContent value=…`; `defaultValue`
  selects the open tab.
- **`Pagination`** > `PaginationContent` > `PaginationItem` with `PaginationLink`
  (`isActive`), `PaginationPrevious`/`Next`/`Ellipsis`.
- **`Item`** > `ItemMedia`/`ItemContent` (`ItemTitle`/`ItemDescription`)/`ItemActions` —
  a list row; `variant="outline"|"muted"`.
- **`Empty`** > `EmptyHeader` (`EmptyMedia`/`EmptyTitle`/`EmptyDescription`) + `EmptyContent`
  — empty-state placeholder.
- **`Calendar`** — month grid (`mode="single"`); pair with `Popover` for a date picker.
- **`ScrollArea`** — scrollable region; set a fixed height via `className`.

### Overlays (open-state primitives — floor-carded in this DS)

- **`Dialog`**, **`AlertDialog`**, **`Drawer`**, **`Sheet`**, **`Popover`** — modal/panel
  surfaces; each has a `*Trigger` (Base UI `render` prop) and `*Content`. Always give
  dialogs/sheets/drawers a `*Title`.
- **`Select`** > `SelectTrigger`(`SelectValue`) + `SelectContent` > `SelectItem` — rich
  dropdown; items inside `SelectGroup`.
- **`Combobox`** — searchable select; **`DatePicker`** — `Calendar` in a `Popover`.

The authoritative API for each is its `<Name>.d.ts`. Read `styles.css` for the exact
tokens and the shipped utility set.

## Idiomatic example

```tsx
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@workspace/ui'

function ProductCard() {
  return (
    <Card className="w-80">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          Aurora Headphones
          <Badge variant="secondary">Draft</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex justify-end gap-2">
        <Button variant="outline" size="sm">Preview</Button>
        <Button size="sm">Publish</Button>
      </CardContent>
    </Card>
  )
}
```
