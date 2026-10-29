// apps/mobile/hooks/useKeyboardOffset.js
// Tracks keyboard height for edge-to-edge layout on iOS and Android.
import { useState, useEffect } from 'react';
import { Keyboard, Platform } from 'react-native';

export function useKeyboardOffset() {
  const [keyboard, setKeyboard] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => setKeyboard(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboard(0));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return {
    keyboard,
    keyboardOpen: keyboard > 0,
  };
}
