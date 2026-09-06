import { useEffect } from 'react'

export function Valid({ value }: { value: string }) {
  useEffect(() => {
    console.log(value)
  }, [value])
  return <div>{value}</div>
}
