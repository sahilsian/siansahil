export function optimizeImage(strapiUrl: string, width?: number, quality = 85): string {
    if (!strapiUrl) return ''

    let path = strapiUrl
    if (strapiUrl.startsWith('http')) {
        const urlObj = new URL(strapiUrl)
        path = urlObj.pathname
    }

    const params = new URLSearchParams()
    if (width) params.set('w', width.toString())
    params.set('q', quality.toString())

    const queryString = params.toString()
    return `/img${path}${queryString ? `?${queryString}` : ''}`
}