import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui'

export function Default() {
  return (
    <Tabs defaultValue="details" className="w-96">
      <TabsList>
        <TabsTrigger value="details">Details</TabsTrigger>
        <TabsTrigger value="variants">Variants</TabsTrigger>
        <TabsTrigger value="pricing">Pricing</TabsTrigger>
      </TabsList>
      <TabsContent value="details" className="pt-3 text-sm text-muted-foreground">
        Product name, handle, and description.
      </TabsContent>
      <TabsContent value="variants" className="pt-3 text-sm text-muted-foreground">
        Options and SKUs.
      </TabsContent>
      <TabsContent value="pricing" className="pt-3 text-sm text-muted-foreground">
        Price lists per channel.
      </TabsContent>
    </Tabs>
  )
}
