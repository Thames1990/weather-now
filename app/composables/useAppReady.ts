// True once the client has mounted and restored persisted preferences (language, theme, favorites).
// Locale- and preference-dependent UI renders skeletons until then so prerendered defaults never flash.
export function useAppReady() {
  return useState<boolean>('app-ready', () => false)
}
