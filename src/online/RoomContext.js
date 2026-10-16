import { createContext, useContext } from 'react'

export const RoomContext = createContext(null)

export function useRoomContext() {
  const context = useContext(RoomContext)
  if (!context) throw new Error('useRoomContext must be used within a RoomContext provider')
  return context
}
