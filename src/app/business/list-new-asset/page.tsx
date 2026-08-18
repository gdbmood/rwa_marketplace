"use client";

import { useActiveAccount, useActiveWalletConnectionStatus, useConnectModal } from "thirdweb/react";
import CreateOrUpdateListing from "@/components/create-update-listing";
import { Box, Divider, CircularProgress } from "@mui/material";
import { connectWalletConfig } from "@/utils/thirdwebConfig";
import ListModal from "@/components/assets/list-modal";
import categoryStore from "@/store/categoryStore";
import { BusinessUser } from "@/types/Users";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebaseClient";
import Footer from "@/components/footer";
import Navbar from "@/components/navbar";
import nftStore from "@/store/nftStore";

export default function ListPage() {
    const router = useRouter();

    const wallet = useActiveAccount()
    const status = useActiveWalletConnectionStatus();
    const { connect, isConnecting } = useConnectModal();

    const { categories, fetchCategories } = categoryStore()
    const { nfts, fetchNfts } = nftStore();

    const [error, setError] = useState("");
    const [user, setUser] = useState<BusinessUser | null>(null);
    const [formData, setFormData] = useState({
        assetType: categories.length ? categories[0].name : "",
        title: "",
        description: "",
        ...(categories.length ? categories[0].fields.reduce((acc: any, field: any) => {
            let fieldId = field.name.charAt(0).toLowerCase() + field.name.slice(1).replace(/\s+/g, '');
            if (field.type === "string" || field.type === "textArea") {
                acc[fieldId] = "";
            }
            else if (field.type === "number") {
                acc[fieldId] = field.min || 0;
            }
            else if (field.type === "dropdown") {
                acc[fieldId] = field.options[0];
            }
            return acc;
        }, {}) : {}),
        valuation: 0,
        amountOfFractions: 0,
        userKycRequired: false,
    });
    const [documents, setDocuments] = useState<{ [key: string]: (File | string)[] }>({});
    const [images, setImages] = useState<(File | string)[]>([]);
    const [showListModal, setShowListModal] = useState(false);
    const [isVerified, setIsVerified] = useState(false);

    useEffect(() => {
        if (Object.keys(categories).length === 0) {
            fetchCategories().then((categories) => {
                if (categories.length > 0) {
                    setFormData(() => ({
                        assetType: categories[0].name,
                        title: "",
                        description: "",
                        ...categories[0].fields.reduce((acc: any, field: any) => {
                            let fieldId = field.name.charAt(0).toLowerCase() + field.name.slice(1).replace(/\s+/g, '');
                            if (field.type === "string" || field.type === "textArea") {
                                acc[fieldId] = "";
                            }
                            else if (field.type === "number") {
                                acc[fieldId] = field.min || 0;
                            }
                            else if (field.type === "dropdown") {
                                acc[fieldId] = field.options[0];
                            }
                            return acc;
                        }, {}),
                        valuation: 0,
                        amountOfFractions: 0,
                        userKycRequired: false,
                    }));
                }
            })
        }
    }, []);
    useEffect(() => {
        if (wallet) {
            db.collection('BusinessUser').doc(wallet.address).get().then((doc) => {
                if (doc.exists) {
                    const userData = doc.data() as BusinessUser;
                    if (!userData?.isVerified) {
                        localStorage.setItem('redirectUrl', '/list-new-asset');
                        router.push('/verify-business');
                    }
                    else {
                        setUser(userData);
                        setIsVerified(true);
                    }
                }
                else {
                    router.push('/');
                }
            })
        }
        else if (status === 'disconnected') {
            connect(connectWalletConfig('business'));
        }
    }, [status, wallet]);
    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [error]);

    const mintAndListAsset = () => {
        setError("");

        if (Object.values(formData).some(value => (typeof value === "string" && !value.trim()) || (typeof value === "number" && value === 0))) {
            setError("All fields are required");
            return;
        }
        if (images.length === 0) {
            setError("At least one image is required");
            return;
        }
        if (Object.keys(documents).length && Object.values(documents).some((doc) => doc.length === 0)) {
            setError("All documents are required");
            return;
        }
        if (categories.find(c => c.name === formData.assetType)?.fields.some((field) => {
            let fieldId = field.name.charAt(0).toLowerCase() + field.name.slice(1).replace(/\s+/g, '');
            if (field.type === "number") {
                if (field.min && formData[fieldId] < field.min) {
                    setError(`${field.name} should be greater than ${field.min}`);
                    return true;
                }
                if (field.max && formData[fieldId] > field.max) {
                    setError(`${field.name} should be less than ${field.max}`);
                    return true;
                }
            }
            else if (field.type === "date") {
                const date = new Date(formData[fieldId]);
                if (field.min && date.getTime() < field.min.getTime()) {
                    setError(`${field.name} should be greater than ${field.min}`);
                    return true;
                }
                if (field.max && date.getTime() > field.max.getTime()) {
                    setError(`${field.name} should be less than ${field.max}`);
                    return true;
                }
            }
            return false;
        })) {
            return;
        }
        if (formData.valuation / formData.amountOfFractions < 0.000001) {
            setError('Price per fraction should be greater than 0.000001');
            return;
        }
        if (!user?.displayName || user.displayName.trim().length === 0) {
            setError("Please complete your profile before listing an asset");
            return;
        }

        setShowListModal(true);
    }

    return (
        <Box sx={{ backgroundColor: "marketplace.background", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
            <Navbar />

            <ListModal user={user} nfts={nfts} categories={categories} fetchNfts={fetchNfts} router={router} formData={formData} images={images} documents={documents} modal={showListModal} setModal={setShowListModal} />
            {
                !isVerified || categories.length === 0 ?
                    <>
                        <Box sx={{ mt: 5, display: 'flex', justifyContent: 'center', alignItems: 'center', flexGrow: 1 }}>
                            <CircularProgress sx={{ color: '#C6FF00' }} />
                        </Box>
                    </>
                    :
                    <CreateOrUpdateListing formData={formData} setFormData={setFormData} images={images} setImages={setImages} documents={documents} setDocuments={setDocuments} error={error} setError={setError} onSubmit={mintAndListAsset} />
            }
            <Divider sx={{ backgroundColor: '#343434' }} />
            <Footer />
        </Box >
    );
}