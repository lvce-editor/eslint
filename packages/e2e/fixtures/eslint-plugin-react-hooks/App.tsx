import { useEffect } from 'react'

export function App({ value }: { value: string }) {
  if (value) {
    useEffect(() => {
      console.log(value)
    }, [])
  }
  return <div>{value}</div>
}
