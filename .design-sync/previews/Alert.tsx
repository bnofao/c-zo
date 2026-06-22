import { Alert, AlertDescription, AlertTitle } from '@workspace/ui'
import { CircleAlert, Info } from 'lucide-react'

export function Default() {
  return (
    <Alert className="w-96">
      <Info />
      <AlertTitle>Heads up</AlertTitle>
      <AlertDescription>Your changes were saved to the global catalog.</AlertDescription>
    </Alert>
  )
}

export function Destructive() {
  return (
    <Alert variant="destructive" className="w-96">
      <CircleAlert />
      <AlertTitle>Listing rejected</AlertTitle>
      <AlertDescription>This product violates the marketplace policy.</AlertDescription>
    </Alert>
  )
}
