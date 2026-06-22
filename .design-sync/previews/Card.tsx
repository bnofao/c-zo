import { Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Input } from '@workspace/ui'

export function Default() {
  return (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Acme Industries</CardTitle>
        <CardDescription>12 products · 3 collections</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Active vendor on the marketplace channel.
      </CardContent>
    </Card>
  )
}

export function Stat() {
  return (
    <Card className="w-56">
      <CardHeader>
        <CardDescription>Revenue</CardDescription>
        <CardTitle className="text-2xl">$48,250</CardTitle>
      </CardHeader>
    </Card>
  )
}

export function WithForm() {
  return (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>New category</CardTitle>
        <CardDescription>Add a global taxonomy category.</CardDescription>
      </CardHeader>
      <CardContent>
        <Input placeholder="Category name" />
      </CardContent>
      <CardFooter>
        <Button className="w-full">Add category</Button>
      </CardFooter>
    </Card>
  )
}
