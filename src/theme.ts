"use client"

import { createTheme } from "@mui/material/styles";

declare module "@mui/material/styles" {
    interface BreakpointOverrides {
        verticalTablet: true;
        horizontalTablet: true;
    }

    interface PaletteOptions {
        login?: {
            background: string;
        };
        navbar?: {
            background: string;
            primary: string;
            secondary: string;
            drawer: {
                background: string;
                text: string;
            }
        };
        thirdwebButton?: {
            text: string;
        };
        border?: string;
        divider?: string;
        marketplace?: {
            background: string;
            searchInputBackground: string;
            searchButtonText: string;
            searchButtonBorder: string;
            filterButtonText: string;
            filterMenuBackground: string;
            categoryFilter?: {
                background: string;
                text: string;
            };
            viewMoreButtonBackground: string;
        };
        listingCard?: {
            background: string;
            text: string;
            buttonText: string;
        };
        readSlider?: {
            secondary: string;
        };
        assetPurchase?: {
            documentRedirectBackground: string;
            documentRedirectBorder: string;
            documentRedirectSecondaryText: string;
            readSlider: {
                primary: string;
                secondary: string;
            };
            slider: string;
            currenciesDisplay: string;
            modal: {
                heading: string;
            };
        };
        portfolio?: {
            secondaryText: string;
            tableOddRow: string;
            tableEvenRow: string;
            tableText: string;
        };
        settings?: {
            secondaryText: string;
        };
        listNewAsset?: {
            background: string;
        };
    }
}

export const theme = createTheme({
    typography: {
        fontFamily: 'Satoshi-Variable, sans-serif',
    },
    breakpoints: {
        values: {
            xs: 0,
            sm: 600,
            verticalTablet: 768,
            md: 900,
            horizontalTablet: 960,
            lg: 1200,
            xl: 1536,
        },
    },
    colorSchemes: {
        light: {
            palette: {
                mode: "light",
                login: {
                    background: "#FAFAFA",
                },
                navbar: {
                    background: '#F5F5F5',
                    primary: "#424242",
                    secondary: "#9E9E9E",
                    drawer: {
                        background: '#FAFAFA',
                        text: '#424242',
                    }
                },
                thirdwebButton: {
                    text: "#FAFAFA",
                },
                border: "#E0E0E0",
                divider: "#E0E0E0",
                marketplace: {
                    background: '#FAFAFA',
                    searchInputBackground: '#FAFAFA',
                    searchButtonText: "#212121",
                    searchButtonBorder: "#BDBDBD",
                    filterButtonText: '#424242',
                    filterMenuBackground: '#FAFAFA',
                    categoryFilter: {
                        background: '#36AB00',
                        text: '#FAFAFA',
                    },
                    viewMoreButtonBackground: '#FAFAFA',
                },
                listingCard: {
                    background: '#EEEEEE',
                    text: "#424242",
                    buttonText: "#212121",
                },
                readSlider: {
                    secondary: "#E43336",
                },
                assetPurchase: {
                    documentRedirectBackground: "#F5F5F5",
                    documentRedirectBorder: "#E0E0E0",
                    documentRedirectSecondaryText: "#757575",
                    readSlider: {
                        primary: "#C8E6C9",
                        secondary: "#FECDD2",
                    },
                    slider: '#36AB00',
                    currenciesDisplay: "#E0E0E0",
                    modal: {
                        heading: "#424242",
                    }
                },
                portfolio: {
                    secondaryText: "#757575",
                    tableOddRow: "#EEEEEE",
                    tableEvenRow: "#FAFAFA",
                    tableText: "#424242",
                },
                settings: {
                    secondaryText: "#616161",
                },
                listNewAsset: {
                    background: "#FAFAFA",
                }
            },
        },
        dark: {
            palette: {
                mode: "dark",
                login: {
                    background: "rgba(22, 22, 22, 0.75)",
                },
                navbar: {
                    background: "#161616",
                    primary: "#FAFAFA",
                    secondary: "#9E9E9E",
                    drawer: {
                        background: 'rgb(0, 0, 0, 0.7)',
                        text: 'white',
                    }
                },
                thirdwebButton: {
                    text: "#161616",
                },
                border: "#424242",
                divider: "#343434",
                marketplace: {
                    background: '#141414',
                    searchInputBackground: 'rgba(255, 255, 255, 0.12)',
                    searchButtonText: "#FFFFFF",
                    searchButtonBorder: "#424242",
                    filterButtonText: '#BDBDBD',
                    filterMenuBackground: '#1B1B1B',
                    categoryFilter: {
                        background: '#C6FF00',
                        text: '#212121',
                    },
                    viewMoreButtonBackground: '#424242',
                },
                listingCard: {
                    background: '#1B1B1B',
                    text: "#FFFFFF",
                    buttonText: "#FAFAFA",
                },
                readSlider: {
                    secondary: "#E34848",
                },
                assetPurchase: {
                    documentRedirectBackground: "#1B1B1B",
                    documentRedirectBorder: "#212121",
                    documentRedirectSecondaryText: "#9E9E9E",
                    readSlider: {
                        primary: "#282A25",
                        secondary: "#2A2524",
                    },
                    slider: '#FAFAFA',
                    currenciesDisplay: "rgba(255, 255, 255, 0.12)",
                    modal: {
                        heading: "#9E9E9E",
                    }
                },
                portfolio: {
                    secondaryText: "#BDBDBD",
                    tableOddRow: "#212121",
                    tableEvenRow: "#141414",
                    tableText: "#ECEFF1",
                },
                settings: {
                    secondaryText: "#BDBDBD",
                },
                listNewAsset: {
                    background: "rgba(22, 22, 22, 0.75)",
                }
            },
        },
    },
    cssVariables: {
        colorSchemeSelector: 'class'
    }
});

export default theme;