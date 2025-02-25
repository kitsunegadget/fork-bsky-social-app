import React from 'react'
import {GestureResponderEvent, Linking} from 'react-native'
import {
  useLinkProps,
  useNavigation,
  StackActions,
} from '@react-navigation/native'
import {sanitizeUrl} from '@braintree/sanitize-url'

import {useInteractionState} from '#/components/hooks/useInteractionState'
import {isWeb} from '#/platform/detection'
import {useTheme, web, flatten, TextStyleProp, atoms as a} from '#/alf'
import {Button, ButtonProps} from '#/components/Button'
import {AllNavigatorParams, NavigationProp} from '#/lib/routes/types'
import {
  convertBskyAppUrlIfNeeded,
  isExternalUrl,
  linkRequiresWarning,
} from '#/lib/strings/url-helpers'
import {useModalControls} from '#/state/modals'
import {router} from '#/routes'
import {Text, TextProps} from '#/components/Typography'

/**
 * Only available within a `Link`, since that inherits from `Button`.
 * `InlineLink` provides no context.
 */
export {useButtonContext as useLinkContext} from '#/components/Button'

type BaseLinkProps = Pick<
  Parameters<typeof useLinkProps<AllNavigatorParams>>[0],
  'to'
> & {
  testID?: string

  /**
   * Label for a11y. Defaults to the href.
   */
  label?: string

  /**
   * The React Navigation `StackAction` to perform when the link is pressed.
   */
  action?: 'push' | 'replace' | 'navigate'

  /**
   * If true, will warn the user if the link text does not match the href.
   *
   * Note: atm this only works for `InlineLink`s with a string child.
   */
  warnOnMismatchingTextChild?: boolean

  /**
   * Callback for when the link is pressed. Prevent default and return `false`
   * to exit early and prevent navigation.
   *
   * DO NOT use this for navigation, that's what the `to` prop is for.
   */
  onPress?: (e: GestureResponderEvent) => void | false

  /**
   * Web-only attribute. Sets `download` attr on web.
   */
  download?: string
}

export function useLink({
  to,
  displayText,
  action = 'push',
  warnOnMismatchingTextChild,
  onPress: outerOnPress,
}: BaseLinkProps & {
  displayText: string
}) {
  const navigation = useNavigation<NavigationProp>()
  const {href} = useLinkProps<AllNavigatorParams>({
    to:
      typeof to === 'string' ? convertBskyAppUrlIfNeeded(sanitizeUrl(to)) : to,
  })
  const isExternal = isExternalUrl(href)
  const {openModal, closeModal} = useModalControls()

  const onPress = React.useCallback(
    (e: GestureResponderEvent) => {
      const exitEarlyIfFalse = outerOnPress?.(e)

      if (exitEarlyIfFalse === false) return

      const requiresWarning = Boolean(
        warnOnMismatchingTextChild &&
          displayText &&
          isExternal &&
          linkRequiresWarning(href, displayText),
      )

      if (requiresWarning) {
        e.preventDefault()

        openModal({
          name: 'link-warning',
          text: displayText,
          href: href,
        })
      } else {
        e.preventDefault()

        if (isExternal) {
          Linking.openURL(href)
        } else {
          /**
           * A `GestureResponderEvent`, but cast to `any` to avoid using a bunch
           * of @ts-ignore below.
           */
          const event = e as any
          const isMiddleClick = isWeb && event.button === 1
          const isMetaKey =
            isWeb &&
            (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey)
          const shouldOpenInNewTab = isMetaKey || isMiddleClick

          if (
            shouldOpenInNewTab ||
            href.startsWith('http') ||
            href.startsWith('mailto')
          ) {
            Linking.openURL(href)
          } else {
            closeModal() // close any active modals

            if (action === 'push') {
              navigation.dispatch(StackActions.push(...router.matchPath(href)))
            } else if (action === 'replace') {
              navigation.dispatch(
                StackActions.replace(...router.matchPath(href)),
              )
            } else if (action === 'navigate') {
              // @ts-ignore
              navigation.navigate(...router.matchPath(href))
            } else {
              throw Error('Unsupported navigator action.')
            }
          }
        }
      }
    },
    [
      href,
      isExternal,
      warnOnMismatchingTextChild,
      navigation,
      action,
      displayText,
      closeModal,
      openModal,
      outerOnPress,
    ],
  )

  return {
    isExternal,
    href,
    onPress,
  }
}

export type LinkProps = Omit<BaseLinkProps, 'warnOnMismatchingTextChild'> &
  Omit<ButtonProps, 'onPress' | 'disabled' | 'label'>

/**
 * A interactive element that renders as a `<a>` tag on the web. On mobile it
 * will translate the `href` to navigator screens and params and dispatch a
 * navigation action.
 *
 * Intended to behave as a web anchor tag. For more complex routing, use a
 * `Button`.
 */
export function Link({
  children,
  to,
  action = 'push',
  onPress: outerOnPress,
  download,
  ...rest
}: LinkProps) {
  const {href, isExternal, onPress} = useLink({
    to,
    displayText: typeof children === 'string' ? children : '',
    action,
    onPress: outerOnPress,
  })

  return (
    <Button
      label={href}
      {...rest}
      style={[a.justify_start, flatten(rest.style)]}
      role="link"
      accessibilityRole="link"
      href={href}
      onPress={download ? undefined : onPress}
      {...web({
        hrefAttrs: {
          target: download ? undefined : isExternal ? 'blank' : undefined,
          rel: isExternal ? 'noopener noreferrer' : undefined,
          download,
        },
        dataSet: {
          // no underline, only `InlineLink` has underlines
          noUnderline: '1',
        },
      })}>
      {children}
    </Button>
  )
}

export type InlineLinkProps = React.PropsWithChildren<
  BaseLinkProps & TextStyleProp & Pick<TextProps, 'selectable'>
>

export function InlineLink({
  children,
  to,
  action = 'push',
  warnOnMismatchingTextChild,
  style,
  onPress: outerOnPress,
  download,
  selectable,
  ...rest
}: InlineLinkProps) {
  const t = useTheme()
  const stringChildren = typeof children === 'string'
  const {href, isExternal, onPress} = useLink({
    to,
    displayText: stringChildren ? children : '',
    action,
    warnOnMismatchingTextChild,
    onPress: outerOnPress,
  })
  const {
    state: hovered,
    onIn: onHoverIn,
    onOut: onHoverOut,
  } = useInteractionState()
  const {state: focused, onIn: onFocus, onOut: onBlur} = useInteractionState()
  const {
    state: pressed,
    onIn: onPressIn,
    onOut: onPressOut,
  } = useInteractionState()
  const flattenedStyle = flatten(style)

  return (
    <Text
      selectable={selectable}
      label={href}
      {...rest}
      style={[
        {color: t.palette.primary_500},
        (hovered || focused || pressed) && {
          outline: 0,
          textDecorationLine: 'underline',
          textDecorationColor: flattenedStyle.color ?? t.palette.primary_500,
        },
        flattenedStyle,
      ]}
      role="link"
      onPress={download ? undefined : onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onFocus={onFocus}
      onBlur={onBlur}
      onMouseEnter={onHoverIn}
      onMouseLeave={onHoverOut}
      accessibilityRole="link"
      href={href}
      {...web({
        hrefAttrs: {
          target: download ? undefined : isExternal ? 'blank' : undefined,
          rel: isExternal ? 'noopener noreferrer' : undefined,
          download,
        },
        dataSet: {
          // default to no underline, apply this ourselves
          noUnderline: '1',
        },
      })}>
      {children}
    </Text>
  )
}
