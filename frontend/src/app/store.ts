import { combineReducers, configureStore } from '@reduxjs/toolkit'
import { setupListeners } from '@reduxjs/toolkit/query'

import { authSlice } from '../features/auth/authSlice'
import { chatSlice } from '../features/chat/chatSlice'
import { api } from './api'

const rootReducer = combineReducers({
  [api.reducerPath]: api.reducer,
  [authSlice.reducerPath]: authSlice.reducer,
  [chatSlice.reducerPath]: chatSlice.reducer,
})

export function makeStore(preloadedState?: Partial<RootState>) {
  const store = configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (getDefault) => getDefault().concat(api.middleware),
  })
  setupListeners(store.dispatch)
  return store
}

export type RootState = ReturnType<typeof rootReducer>
export type AppStore = ReturnType<typeof makeStore>
export type AppDispatch = AppStore['dispatch']
