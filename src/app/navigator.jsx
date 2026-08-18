import { createContext, useCallback, useContext, useMemo, useState } from 'react';

/**
 * A tiny screen stack that mirrors React Navigation's API.
 *
 * Deliberately not a URL router. This is a kiosk exam app: there is no address
 * bar, and browser history would hand a student a Back button out of a paper in
 * progress. Screens keep the navigate / replace / reset calls they use on
 * mobile, so the two apps stay line-for-line comparable.
 */

const NavigationContext = createContext(null);

export function NavigationProvider({ initialRouteName, children, screens }) {
  const [stack, setStack] = useState([{ name: initialRouteName, params: {} }]);

  const navigate = useCallback((name, params = {}) => {
    setStack((prev) => [...prev, { name, params }]);
  }, []);

  const replace = useCallback((name, params = {}) => {
    setStack((prev) => [...prev.slice(0, -1), { name, params }]);
  }, []);

  const goBack = useCallback(() => {
    setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  const reset = useCallback(({ routes }) => {
    setStack(routes.map((route) => ({ name: route.name, params: route.params || {} })));
  }, []);

  const current = stack[stack.length - 1];

  const navigation = useMemo(
    () => ({ navigate, replace, goBack, reset, canGoBack: stack.length > 1 }),
    [navigate, replace, goBack, reset, stack.length],
  );

  const Screen = screens[current.name];

  const value = useMemo(
    () => ({ navigation, route: { name: current.name, params: current.params } }),
    [navigation, current.name, current.params],
  );

  return (
    <NavigationContext.Provider value={value}>
      {Screen ? (
        // Keyed on the route so a screen genuinely remounts when navigated to
        // again — an exam must never resume with the previous paper's state.
        <Screen
          key={`${current.name}-${stack.length}`}
          navigation={navigation}
          route={{ name: current.name, params: current.params }}
        />
      ) : (
        <div className="screen-missing">Screen “{current.name}” is not registered.</div>
      )}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const ctx = useContext(NavigationContext);

  if (!ctx) throw new Error('useNavigation must be used inside NavigationProvider');

  return ctx.navigation;
}

export function useRoute() {
  const ctx = useContext(NavigationContext);

  if (!ctx) throw new Error('useRoute must be used inside NavigationProvider');

  return ctx.route;
}
