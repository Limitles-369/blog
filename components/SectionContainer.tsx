import { ReactNode } from 'react'

interface Props {
  children: ReactNode
}

export default function SectionContainer({ children }: Props) {
  return (
    <section className="mx-auto w-full flex-1 px-4 sm:px-6 xl:px-10 2xl:px-16">{children}</section>
  )
}
