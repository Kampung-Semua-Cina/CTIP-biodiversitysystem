// apps/mobile/navigation/useAppNavigation.js
// Stack navigation state machine and Android hardware back button handler.
import { useState, useEffect } from 'react';
import { BackHandler } from 'react-native';
import { getRoleTabs, getRoleDefaultTab } from './tabs.js';

export function useAppNavigation(role) {
  const first = getRoleDefaultTab(role);
  const [stack, setStack] = useState([{ name: first, params: {} }]);
  const [stackRole, setStackRole] = useState(role);

  // Signing in or out (or switching the prototype role) starts again at that role's first tab.
  if (stackRole !== role) {
    setStackRole(role);
    setStack([{ name: first, params: {} }]);
  }

  const route = stack[stack.length - 1];

  const nav = {
    go: (name, params = {}) => setStack((s) => [...s, { name, params }]),
    replace: (name, params = {}) => setStack((s) => [...s.slice(0, -1), { name, params }]),
    back: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
    tab: (name) => setStack([{ name, params: {} }]),
    home: () => setStack([{ name: first, params: {} }]),
    canGoBack: stack.length > 1,
  };

  // Android hardware back button walks back through the screen stack.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length > 1) {
        setStack((s) => s.slice(0, -1));
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [stack.length]);

  const tabs = getRoleTabs(role);
  const tabKeys = tabs.map((t) => t.key);
  const currentTab = tabKeys.includes(route.name)
    ? route.name
    : tabKeys.includes(stack[0].name)
    ? stack[0].name
    : null;

  return {
    stack,
    route,
    nav,
    currentTab,
    first,
  };
}
