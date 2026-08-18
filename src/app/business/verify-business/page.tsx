"use client";

import { useActiveWallet, useConnectModal, useDisconnect } from 'thirdweb/react';
import { connectWalletConfig } from '@/utils/thirdwebConfig';
import { Box, CircularProgress } from '@mui/material';
import { useState, useEffect, useRef } from 'react';
import SumsubWebSdk from '@sumsub/websdk-react'
import { isLoggedIn } from '@/actions/login';
import { useRouter } from 'next/navigation';

const SumsubVerification = () => {
    const router = useRouter();

    const { connect, isConnecting } = useConnectModal();
    const { disconnect } = useDisconnect();
    const activeWallet = useActiveWallet();

    const [token, setToken] = useState();
    const [timeoutCancel, setTimeoutCancel] = useState(false);

    const isConnectingRef = useRef(isConnecting);

    const fetchToken = async () => {
        try {
            const response = await fetch('/api/create-verification-session?level=id-and-liveness');
            const data = await response.json();
            setToken(data);
        } catch (error) {
            console.error('Error fetching token:', error);
        }
    };

    useEffect(() => { isConnectingRef.current = isConnecting }, [isConnecting]);
    useEffect(() => {
        isLoggedIn().then((loggedIn) => {
            if (loggedIn) {
                fetchToken()
            }
            else {
                if (activeWallet) {
                    setTimeout(async () => {
                        if (!(await isLoggedIn()) && !isConnectingRef.current) {
                            disconnect(activeWallet);
                            connect(connectWalletConfig('business'));
                        }
                        else {
                            setTimeoutCancel(true);
                        }
                    }, 4000);
                }
                else if (!isConnecting) {
                    router.push('/');
                }
            }
        })
    }, [activeWallet, isConnecting, timeoutCancel]);

    return (
        <div>
            {token ?
                <SumsubWebSdk
                    accessToken={token}
                    expirationHandler={fetchToken}
                    onError={(error: any) => {
                        console.error('Error:', error);
                    }}
                    onMessage={(message: any) => {
                        if (message.includes('onApplicantStatusChanged')) {
                            if (localStorage) {
                                const redirectUrl = localStorage.getItem('redirectUrl');
                                if (redirectUrl) {
                                    localStorage.removeItem('redirectUrl');
                                    router.push(redirectUrl);
                                }
                            }
                        }
                        console.log('Message:', message);
                    }}
                />
                :
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
                    <CircularProgress sx={{ color: '#C6FF00' }} />
                </Box>
            }
        </div>
    );
};

export default SumsubVerification;
