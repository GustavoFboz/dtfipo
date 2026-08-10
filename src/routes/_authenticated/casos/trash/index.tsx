import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/casos/trash/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_authenticated/casos/trash/"!</div>
}
