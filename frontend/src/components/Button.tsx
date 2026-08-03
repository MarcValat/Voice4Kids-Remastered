import type { ButtonHTMLAttributes } from 'react'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary'
}

const VARIANTS = {
  primary: 'bg-orange-500 text-white shadow-sm hover:bg-orange-600',
  secondary: 'bg-orange-100 text-orange-900 hover:bg-orange-200',
}

export default function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`rounded-full px-5 py-2.5 font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}
