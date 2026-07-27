{import('tailwindcss').config}
module.exports = {
    content: [
        "./*.html",
        "./src/**/*.{html,js,php}",
    ],
    theme: {
        extend: {
            colors: {
                northlineLight: "#DF414F",
                northlineDeep: "#f76d79de",
                northlineDeep: "#df414e25",
            },
        },
    },
    plugins: [],
}