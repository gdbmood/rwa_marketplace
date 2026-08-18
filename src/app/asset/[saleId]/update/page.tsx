"use client";

import { Box, Divider, CircularProgress, Typography, Button, Modal } from "@mui/material";
import { useActiveAccount, useSendAndConfirmTransaction } from "thirdweb/react";
import CreateOrUpdateListing from "@/components/create-update-listing";
import { useParams, useRouter } from "next/navigation";
import { db, storage } from "@/lib/firebaseClient";
import categoryStore from "@/store/categoryStore";
import { contract } from '@/lib/thirdWebClient';
import { prepareContractCall } from "thirdweb";
import { useState, useEffect } from "react";
import { updateListing } from "@/utils/ABI";
import assetStore from "@/store/assetStore";
import Footer from "@/components/footer";
import Navbar from "@/components/navbar";
import nftStore from "@/store/nftStore";
import { Asset } from "@/types/Asset";
import { NFT } from "@/types/NFT";
import Image from "next/image";

export default function UpdateListingPage() {
    const router = useRouter();
    const params = useParams<{ saleId: string }>()

    const wallet = useActiveAccount();
    const { mutate: sendAndConfirmTx, error: txError, isPending, isSuccess, data } = useSendAndConfirmTransaction();

    const { fetchAssets } = assetStore();
    const { nfts, fetchNfts } = nftStore();
    const { categories, fetchCategories } = categoryStore()

    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [isUpdating, setIsUpdating] = useState(false);
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
    const [nft, setNft] = useState<NFT | null>(null);

    async function fetchData() {
        if (wallet) {
            const doc = await db.collection("Asset").doc(params.saleId).get()
            if (doc.exists) {
                const data = doc.data() as Asset;
                if (data.minterId === wallet.address) {
                    const nft = nfts.find(nft => nft.nftId === Number(params.saleId));
                    if (nft) {
                        const kycReq = await db.collection('Asset').doc(params.saleId).collection('KYCRequirement').where('sumsubVerified', '==', true).limit(1).get();
                        setFormData({
                            assetType: nft.metadata.assetClass,
                            title: nft.metadata.nftName,
                            description: nft.metadata.description,
                            valuation: nft.totalSupply * nft.pricePerFraction,
                            amountOfFractions: nft.totalSupply,
                            ...Object.keys(nft.metadata).reduce((acc: any, key: string) => {
                                if (key === "nftName" || key === "description" || key === "imageUrls" || key === "documentUrls") {
                                    return acc;
                                }
                                acc[key] = nft.metadata[key];
                                return acc;
                            }, {}),
                            userKycRequired: kycReq.docs.length > 0
                        });
                        setImages(nft.metadata.imageUrls.map(url => url));
                        setDocuments(nft.metadata.documentUrls);
                        setNft(nft);
                    }
                    else {
                        router.push("/marketplace");
                    }
                }
                else {
                    router.push("/marketplace");
                }
            }
            else {
                router.push("/marketplace");
            }
        }
        setLoading(false);
    }
    useEffect(() => {
        if (Object.keys(categories).length === 0) {
            fetchCategories().then(() => {
                fetchData()
            })
        }
        else {
            fetchData();
        }
    }, [wallet]);
    useEffect(() => {
        if (error.trim().length > 0) {
            setIsUpdating(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [error]);
    useEffect(() => {
        if (txError) {
            setError(txError.message);
        }
    }, [txError]);

    async function updateDB() {
        if (isSuccess && wallet) {
            const assetDoc = await db.collection("Asset").doc(params.saleId).get();
            const assetData = assetDoc.data() as Asset;
            await Promise.all([
                db.collection("Asset").doc(params.saleId).update({
                    assetName: formData.title,
                    pricePerFraction: assetData.pricePerFraction < Math.round((formData.valuation / formData.amountOfFractions) * 1e6) / 1e6 ? assetData.pricePerFraction : Math.round((formData.valuation / formData.amountOfFractions) * 1e6) / 1e6,
                }),
                db.collection("Asset").doc(params.saleId).collection("Listing").where('listerId', '==', wallet.address).get().then(querySnapshot => {
                    if (!querySnapshot.empty) {
                        querySnapshot.docs[0].ref.update({
                            pricePerFraction: Math.round((formData.valuation / formData.amountOfFractions) * 1e6) / 1e6
                        });
                    }
                }),
                (async () => {
                    const querySnapshot = await db.collection("Asset").doc(params.saleId).collection("KYCRequirement").where('sumsubVerified', '==', true).get();
                    if (formData.userKycRequired && querySnapshot.docs.length === 0) {
                        await db.collection("Asset").doc(params.saleId).collection("KYCRequirement").add({
                            sumsubVerified: true,
                        });
                    }
                    else if (!formData.userKycRequired && querySnapshot.docs.length > 0) {
                        await Promise.all(querySnapshot.docs.map(doc => doc.ref.delete()));
                    }
                })()
            ]);
            fetchNfts();
            fetchAssets();
            setIsUpdating(false);
        }
    }
    useEffect(() => { updateDB() }, [isSuccess]);

    const mintAndListAsset = async () => {
        if (!nft) { return; }

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
        setError("");

        const imagePath = decodeURIComponent(images.filter(image => typeof image === "string")[0].split("?")[0]).split('?')[0].split('/').slice(-4, -1).join('/');
        const documentPath = Object.keys(documents).length ? decodeURIComponent(documents[Object.keys(documents)[0]].filter(document => typeof document === "string")[0].split("?")[0]).split('?')[0].split('/').slice(-4, -1).join('/') : undefined;
        const alreadyUploadedImages = images.filter(image => typeof image === "string").map(image => decodeURIComponent(image).split("?")[0].split("/").slice(-1).join("/"));
        const alreadyUploadedDocuments = Object.keys(documents).reduce((acc: any, key: string) => {
            if (documents[key].length > 0) {
                acc[key] = [];
                for (let i = 0; i < documents[key].length; i++) {
                    const document = documents[key][i];
                    if (typeof document === "string") {
                        const path = decodeURIComponent(document).split("?")[0].split("/").slice(-1).join("/");
                        acc[key].push(path);
                    }
                }
            }
            else {
                acc[key] = [];
            }
            return acc;
        }, {});

        setIsUpdating(true);
        const uploadedImagesUrls = [];
        for (let i = 0; i < images.length; i++) {
            const image = images[i];
            if (image instanceof File) {
                const imageRef = storage.ref(imagePath + '/' + image.name);
                if (alreadyUploadedImages.includes(image.name)) {
                    await imageRef.delete();
                }
                await imageRef.put(image);
                if (!alreadyUploadedImages.includes(image.name)) {
                    uploadedImagesUrls.push(await imageRef.getDownloadURL());
                }
            }
            else {
                uploadedImagesUrls.push(image);
            }
        }

        const uploadedDocumentsUrls: { [key: string]: string[] } = {};
        for (const key in documents) {
            const documentArray = documents[key];
            for (let i = 0; i < documentArray.length; i++) {
                const document = documentArray[i];
                if (document instanceof File) {
                    const documentRef = storage.ref(documentPath + '/' + document.name);
                    if (alreadyUploadedDocuments[key].includes(document.name)) {
                        await documentRef.delete();
                    }
                    await documentRef.put(document);
                    if (!alreadyUploadedDocuments[key].includes(document.name)) {
                        if (!uploadedDocumentsUrls[key]) {
                            uploadedDocumentsUrls[key] = [];
                        }
                        uploadedDocumentsUrls[key].push(await documentRef.getDownloadURL());
                    }
                }
                else {
                    if (!uploadedDocumentsUrls[key]) {
                        uploadedDocumentsUrls[key] = [];
                    }
                    uploadedDocumentsUrls[key].push(document);
                }
            }
        }

        const metadata = {
            nftName: formData.title,
            description: formData.description,
            imageUrls: uploadedImagesUrls,
            documentUrls: uploadedDocumentsUrls,
            ...Object.keys(formData).reduce((acc: any, key: string) => {
                if (key === "assetType" || key === "title" || key === "description" || key === "valuation" || key === "amountOfFractions") {
                    return acc;
                }
                acc[key] = formData[key];
                return acc;
            }, {})
        };
        const transaction = prepareContractCall({
            contract,
            method: updateListing,
            params: [BigInt(nft.nftId), BigInt(Math.round((formData.valuation / formData.amountOfFractions) * 1e6)), JSON.stringify(metadata)]
        });
        sendAndConfirmTx(transaction);
    }
    return (
        <Box sx={{ backgroundColor: "marketplace.background", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
            <Navbar />
            {!loading ?
                <>
                    <Modal
                        open={isSuccess}
                        aria-labelledby="modal-modal-title"
                        aria-describedby="modal-modal-description"
                    >
                        <Box sx={{ position: { sm: 'absolute' }, top: '50%', left: '50%', transform: { sm: 'translate(-50%, -50%)' }, bgcolor: '#141414', px: { xs: 3.5, sm: 5, verticalTablet: 12 }, py: 10, width: { xs: "100%", sm: "90%", horizontalTablet: "65%" }, overflowY: 'auto', height: { xs: "100%", sm: 'auto' }, display: "flex", alignItems: "center", flexDirection: "column", backgroundColor: "#141414" }}>
                            <Image src="/webp/party-popper.webp" width={100} height={100} alt="confirm" />
                            <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h6", sm: "h4" }, color: "#FAFAFA", my: { xs: 3, sm: 5 } }}>Asset updated successfully!</Typography>
                            <Button onClick={() => { router.push('/asset/' + params.saleId); }} variant="contained" sx={{ backgroundColor: "#212121", borderRadius: 5, border: "1px solid #757575", py: 1, px: 3, height: "55px", width: { xs: "290px", sm: "344px", verticalTablet: "480px" } }}>
                                <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "subtitle1", horizontalTablet: "h6" }, color: "#FAFAFA" }}>Go to tokenized assets</Typography>
                            </Button>
                        </Box>
                    </Modal>
                    <CreateOrUpdateListing update={true} formData={formData} setFormData={setFormData} images={images} setImages={setImages} documents={documents} setDocuments={setDocuments} error={error} setError={setError} onSubmit={mintAndListAsset} isPending={isUpdating} />
                </>
                :
                <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", flexGrow: 1 }}>
                    <CircularProgress sx={{ color: "#C6FF00" }} />
                </Box>
            }
            <Divider sx={{ backgroundColor: '#343434' }} />
            <Footer />
        </Box >
    );
}