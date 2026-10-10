// web/src/store.js
import { createContext, useContext } from "react";

// The provider lives in StoreProvider.jsx. Pages call useStore() to read the
// sample database and to run actions such as reviewObservation().
export const StoreContext = createContext(null);
export const useStore = () => useContext(StoreContext);
