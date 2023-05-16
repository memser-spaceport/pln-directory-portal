import { usePostHog } from 'posthog-js/react'
function useAppAnalytics() {
    const postHogProps = usePostHog();
    const captureEvent = (eventName, eventParams = {}) => {
        try {
            if (postHogProps?.capture) {
                postHogProps.capture(eventName, { ...eventParams })
            }
        } catch (e) {
            console.error(e)
        }
    }

    return { captureEvent }
}

export default useAppAnalytics;