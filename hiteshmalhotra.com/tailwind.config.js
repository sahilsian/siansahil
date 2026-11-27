module.exports = {
    theme: {
        extend: {
            keyframes: {
                typewriter: {
                    'from': { width: '0', opacity: '0' },
                    'to': { width: '100%', opacity: '1' }
                }
            },
            animation: {
                'typewriter-fast': 'typewriter 0.8s steps(40, end) forwards',
                'typewriter-slow': 'typewriter 1.2s steps(60, end) 0.3s forwards'
            }
        }
    }
}