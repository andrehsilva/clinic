import { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'

interface ToastProps {
  message: string
  onClose: () => void
  duration?: number
}

export function Toast({ message, onClose, duration = 5000 }: ToastProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const show = setTimeout(() => setVisible(true), 10)
    const hide = setTimeout(() => setVisible(false), duration)
    const close = setTimeout(onClose, duration + 200)
    return () => { clearTimeout(show); clearTimeout(hide); clearTimeout(close) }
  }, [onClose, duration])

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-start gap-3 max-w-md w-[calc(100%-2rem)]
                  bg-card border border-status-warning/30 rounded-2xl shadow-card-hover px-4 py-3
                  transition-all duration-200 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
    >
      <div className="w-8 h-8 rounded-lg bg-status-warning-light flex items-center justify-center flex-shrink-0">
        <AlertTriangle size={16} className="text-status-warning" />
      </div>
      <p className="text-sm text-text-primary flex-1 pt-1">{message}</p>
      <button
        onClick={() => setVisible(false)}
        className="text-text-secondary hover:text-text-primary p-1 -m-1 flex-shrink-0"
      >
        <X size={16} />
      </button>
    </div>
  )
}
