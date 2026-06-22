import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@workspace/ui'

const rows = [
  { name: 'Aurora Headphones', handle: 'aurora-headphones', status: 'Published' },
  { name: 'Nimbus Backpack', handle: 'nimbus-backpack', status: 'Draft' },
  { name: 'Vertex Keyboard', handle: 'vertex-keyboard', status: 'Published' },
]

export function Products() {
  return (
    <div className="w-[34rem]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Handle</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(row => (
            <TableRow key={row.handle}>
              <TableCell className="font-medium">{row.name}</TableCell>
              <TableCell className="text-muted-foreground">{row.handle}</TableCell>
              <TableCell>
                <Badge variant={row.status === 'Published' ? 'secondary' : 'outline'}>{row.status}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
