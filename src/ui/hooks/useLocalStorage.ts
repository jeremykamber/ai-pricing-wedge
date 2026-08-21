'use client'

import { useState, useEffect, Dispatch, SetStateAction } from 'react'

export function useLocalStorage<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>] {
  // Pass initialValue to useState so that the first render (SSR/Hydration) 
  // matches what the server would produce.
  const [storedValue, setStoredValue] = useState<T>(initialValue)
  const [isInitialized, setIsInitialized] = useState(false)

  // Load from localStorage after mount, or reset to initialValue when
  // the key changes and no value exists for the new key.
  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key)
      if (item) {
        setStoredValue(JSON.parse(item))
      } else {
        setStoredValue(initialValue)
      }
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error)
    }
    setIsInitialized(true)
  }, [key])

  // Save to localStorage whenever storedValue changes
  useEffect(() => {
    if (!isInitialized) return

    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue))
    } catch (error) {
      console.warn(`Error setting localStorage key "${key}":`, error)
    }
  }, [key, storedValue, isInitialized])

  return [storedValue, setStoredValue]
}
