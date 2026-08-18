import { Box, Typography, TextField, Button, CircularProgress, MenuItem, Checkbox } from "@mui/material";
import categoryStore from "@/store/categoryStore";
import Dropzone from 'react-dropzone'
import Image from "next/image";

const textFieldStyle = {
    // User input color
    input: { color: "marketplace.filterButtonText" },

    "& .MuiInput-root": {
        // Bottom border
        "&:before": {
            borderColor: "#424242"
        },
        // Focus bottom border
        "&:after": {
            borderColor: "#424242"
        },
        // Hover bottom border
        ":hover:not(.Mui-focused)": {
            "&:before": {
                borderColor: "#424242"
            },
        },
    },
}

export default function CreateOrUpdateListing(props: {
    update?: boolean,
    error: string, setError: (error: string) => void,
    isPending?: boolean,
    formData: any, setFormData: any,
    images: (File | string)[], setImages: (images: (File | string)[]) => void,
    documents: { [key: string]: (File | string)[] }, setDocuments: (documents: { [key: string]: (File | string)[] }) => void,
    onSubmit: () => void
}) {
    const { categories } = categoryStore()
    return (
        <Box sx={[
            {
                pt: { xs: 4, sm: 9 }, pb: { xs: 0, sm: 9 }, display: 'flex', justifyContent: 'center',
                backgroundImage: `image-set(url('/img/signup-bg-light.png') 1x, url('/img/signup-bg-light.png') 2x)`,
                backgroundSize: 'contain', minHeight: "100vh"
            },
            (theme) => theme.applyStyles('dark', {
                backgroundImage: `image-set(url('/img/signup-bg.png') 1x, url('/img/signup-bg.png') 2x)`
            }),
        ]}>
            <Box sx={{ px: { xs: "20px", sm: "58px", verticalTablet: "150px" }, py: 3, backgroundColor: "listNewAsset.background", border: { sm: 1 }, borderColor: { sm: "border" }, borderRadius: 2.5, width: { xs: "100%", sm: "90%", verticalTablet: "780px" } }}>
                <Typography style={{ fontWeight: 500 }} sx={{ typography: { xs: "h5", sm: "h3" }, color: "marketplace.categoryFilter.background", mb: 4, width: "100%", textAlign: "center" }}>
                    {props.update ? "Update the asset" : "List New Asset"}
                </Typography>
                {props.error && <Typography variant="body1" sx={{ color: "#FF0000", fontWeight: 500, mb: 2 }}>{props.error}</Typography>}
                <TextField
                    fullWidth
                    select
                    slotProps={
                        {
                            input: {
                                readOnly: props.update
                            },
                        }
                    }
                    label={"Asset Type"}
                    variant="standard"
                    value={props.formData["assetType"] ?? categories[0].name}
                    onChange={(e) => {
                        let updatedFormData = {
                            assetType: e.target.value,
                            title: "",
                            description: "",
                            ...categories.find(c => c.name === e.target.value)?.fields.reduce((acc: any, field: any) => {
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
                        }
                        props.setFormData(updatedFormData)
                        props.setDocuments({});
                        props.setImages([]);
                    }}
                    // Label color
                    InputLabelProps={{ style: { color: 'marketplace.filterButtonText' } }}
                    sx={{ ...textFieldStyle, mt: 2 }}
                >
                    {categories.map((option) => (
                        <MenuItem key={option._id} value={option.name} sx={{ color: "marketplace.filterButtonText" }}>
                            {option.name}
                        </MenuItem>
                    ))}
                </TextField>
                <TextField
                    fullWidth
                    label={"Title"}
                    variant="standard"
                    value={props.formData.title}
                    onChange={(e) => props.setFormData({ ...props.formData, title: e.target.value })}
                    // Label color
                    InputLabelProps={{ style: { color: 'marketplace.filterButtonText' } }}
                    sx={{ ...textFieldStyle, mt: 2 }}
                />
                <TextField
                    fullWidth
                    multiline
                    rows={3}
                    label={"Description"}
                    variant="standard"
                    value={props.formData.description}
                    onChange={(e) => props.setFormData({ ...props.formData, description: e.target.value })}
                    // Label color
                    InputLabelProps={{ style: { color: 'marketplace.filterButtonText' } }}
                    sx={{ ...textFieldStyle, mt: 2 }}
                />
                {(categories.find(c => c.name === props.formData.assetType) ?? categories[0]).fields.map((field, index) => {
                    let fieldId = field.name.charAt(0).toLowerCase() + field.name.slice(1).replace(/\s+/g, '');
                    return field.type === "string" ? (
                        <TextField
                            key={index}
                            fullWidth
                            label={field.name}
                            variant="standard"
                            value={props.formData[fieldId]}
                            onChange={(e) => props.setFormData({ ...props.formData, [fieldId]: e.target.value })}
                            // Label color
                            InputLabelProps={{ style: { color: 'marketplace.filterButtonText' } }}
                            sx={{ ...textFieldStyle, mt: 2 }}
                        />
                    ) : field.type === "textArea" ? (
                        <TextField
                            key={index}
                            fullWidth
                            multiline
                            rows={3}
                            label={field.name}
                            variant="standard"
                            value={props.formData[fieldId]}
                            onChange={(e) => props.setFormData({ ...props.formData, [fieldId]: e.target.value })}
                            // Label color
                            InputLabelProps={{ style: { color: 'marketplace.filterButtonText' } }}
                            sx={{ ...textFieldStyle, mt: 2 }}
                        />
                    ) : field.type === "number" ? (
                        <TextField
                            key={index}
                            fullWidth
                            label={field.name}
                            variant="standard"
                            value={props.formData[fieldId]}
                            onChange={(e) => {
                                if (e.target.value === "") {
                                    props.setFormData({ ...props.formData, [fieldId]: 0 })
                                }
                                if (Number(e.target.value) > 0) {
                                    props.setFormData({ ...props.formData, [fieldId]: Number(e.target.value) })
                                }
                            }}
                            error={!!(((field.min && props.formData[fieldId] < field.min) || (props.formData[fieldId] < 0)) || (field.max && props.formData[fieldId] > field.max))}
                            helperText={((field.min && props.formData[fieldId] < field.min) || (props.formData[fieldId] < 0)) ? `Minimum value is ${field.min}` : (field.max && props.formData[fieldId] > field.max) ? `Maximum value is ${field.max}` : ""}
                            // Label color
                            InputLabelProps={{ style: { color: 'marketplace.filterButtonText' } }}
                            sx={{ ...textFieldStyle, mt: 2 }}
                        />
                    ) : field.type === "dropdown" ? (
                        <TextField
                            key={index}
                            fullWidth
                            select
                            label={field.name}
                            variant="standard"
                            value={props.formData[fieldId]}
                            onChange={(e) => props.setFormData({ ...props.formData, [fieldId]: e.target.value })}
                            // Label color
                            InputLabelProps={{ style: { color: 'marketplace.filterButtonText' } }}
                            sx={{ ...textFieldStyle, mt: 2 }}
                        >
                            {field.options?.map((option, index) => (
                                <MenuItem key={index} value={option} sx={{ color: "marketplace.filterButtonText" }}>
                                    {option}
                                </MenuItem>
                            ))}
                        </TextField>
                    ) : field.type === "date" ? (
                        <TextField
                            key={index}
                            fullWidth
                            label={field.name}
                            variant="standard"
                            type="date"
                            value={props.formData[fieldId]}
                            onChange={(e) => props.setFormData({ ...props.formData, [fieldId]: e.target.value })}
                            // Label color
                            InputLabelProps={{ style: { color: 'marketplace.filterButtonText' }, shrink: true, required: true }}
                            sx={{ ...textFieldStyle, mt: 2 }}
                            InputProps={{
                                inputProps: {
                                    min: field.min ? new Date(field.min).toISOString().split("T")[0] : undefined,
                                    max: field.max ? new Date(field.max).toISOString().split("T")[0] : undefined,
                                },
                            }}
                        />
                    ) : null
                })}
                <TextField
                    fullWidth
                    label={"Valuation (USD)"}
                    variant="standard"
                    value={props.formData.valuation}
                    onChange={(e) => {
                        if (e.target.value === "") {
                            props.setFormData({ ...props.formData, valuation: 0 })
                        }
                        if (Number(e.target.value) > 0 && Number(e.target.value) <= 1000000000) {
                            props.setFormData({ ...props.formData, valuation: Number(e.target.value) })
                        }
                    }}
                    error={!!(((props.formData.valuation < 0)) || (props.formData.valuation > 1000000000))}
                    helperText={((props.formData.valuation < 0)) ? `Minimum value is 0` : (props.formData.valuation > 1000000000) ? `Maximum value is 100,000,000,000` : ""}
                    // Label color
                    InputLabelProps={{ style: { color: 'marketplace.filterButtonText' } }}
                    sx={{ ...textFieldStyle, mt: 2 }}
                />
                <TextField
                    fullWidth
                    slotProps={
                        {
                            input: {
                                readOnly: props.update
                            },
                        }
                    }
                    label={"Amounts of Fractions"}
                    variant="standard"
                    value={props.formData.amountOfFractions}
                    onChange={(e) => {
                        if (e.target.value === "") {
                            props.setFormData({ ...props.formData, amountOfFractions: 0 })
                        }
                        if (Number(e.target.value) > 0) {
                            props.setFormData({ ...props.formData, amountOfFractions: Number(e.target.value) })
                        }
                    }}
                    // Label color
                    InputLabelProps={{ style: { color: 'marketplace.filterButtonText' } }}
                    sx={{ ...textFieldStyle, mt: 2 }}
                />
                <TextField
                    fullWidth
                    label={"Price per Fraction"}
                    slotProps={{
                        input: {
                            readOnly: true,
                        },
                    }}
                    variant="standard"
                    value={props.formData.valuation && props.formData.amountOfFractions ? Number(props.formData.valuation) / Number(props.formData.amountOfFractions) : ""}
                    // Label color
                    InputLabelProps={{ style: { color: 'marketplace.filterButtonText' } }}
                    sx={{ ...textFieldStyle, mt: 2 }}
                />
                {/* <Typography variant="subtitle1" sx={{ color: "marketplace.filterButtonText", mt: 3 }}>Asset class filters</Typography>
                <Typography sx={{ color: "#757575", fontSize: "12px" }}>Select the category to which your asset belongs</Typography>
                <Box sx={{ mt: 2, display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
                    {categories.map((category, index) => (
                        <Box key={index} onClick={() => { props.setFormData({ ...props.formData, category }) }} sx={{ px: 2.5, py: 0.5, borderRadius: 12.5, border: 1, borderColor: "border", cursor: "pointer", backgroundColor: props.formData.category === category ? "marketplace.categoryFilter.background" : "" }}>
                            <Typography variant="subtitle2" sx={[
                                {
                                    color: props.formData.category === category ? "#FAFAFA" : "marketplace.filterButtonText", fontFamily: "Roboto"
                                },
                                (theme) => theme.applyStyles('dark', {
                                    color: props.formData.category === category ? "black" : "marketplace.filterButtonText"
                                })
                            ]}>{category}</Typography>
                        </Box>
                    ))}
                </Box> */}
                <Typography variant="subtitle1" sx={{ color: "marketplace.filterButtonText", mt: 3 }}>Add photos of your asset</Typography>
                <Typography sx={{ color: "#757575", fontSize: "12px" }}>The first image uploaded will also be the cover showed in the marketplace card</Typography>
                <Box sx={{ display: props.images.length ? "flex" : 'block', gap: 1, flexWrap: "wrap", mt: 2 }}>
                    {props.images.map((image, index) => (
                        <Box key={index} sx={{ position: "relative", width: 60, height: 60 }}>
                            <Image src={typeof image === "string" ? image : URL.createObjectURL(image)} alt="image" width={0} height={0} sizes="100vw" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10 }} />
                            <Box
                                onClick={(e) => {
                                    e.stopPropagation();
                                    props.setImages(props.images.filter((_, i) => i !== index));
                                }}
                                sx={{ position: "absolute", top: 0, right: 0, cursor: "pointer" }}
                            >
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M0 0H16C20.4183 0 24 3.58172 24 8V24H8C3.58172 24 0 20.4183 0 16V0Z" fill="#424242" />
                                    <path d="M16.2431 7.75786L7.75781 16.2431M16.2431 16.2431L7.75781 7.75781" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </Box>
                        </Box>
                    ))}
                    <Dropzone
                        accept={{ 'image/png': ['.png'], 'image/jpeg': ['.jpeg'], 'image/jpg': ['.jpg'] }}
                        multiple={true}
                        onDrop={acceptedFiles => {
                            props.setError("");

                            if (acceptedFiles.some(file => !file.size || file.size > 5 * 1024 * 1024)) {
                                props.setError("File size should be less than 5MB");
                                return;
                            }
                            if (acceptedFiles.length > 6) {
                                props.setError("You can only upload 6 images");
                                return;
                            }

                            props.setImages([...props.images.filter(image => !acceptedFiles.some(file => typeof image === "string" ? file.name === image : file.name === image.name)), ...acceptedFiles]);
                        }}>
                        {({ getRootProps, getInputProps, open }) => (
                            <Box {...getRootProps()} onClick={open} sx={{ border: props.images.length === 0 ? `1px dashed #424242` : '', borderRadius: "10px", p: props.images.length === 0 ? 2 : 0, display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer" }}>
                                <input {...getInputProps()} />
                                {
                                    props.images.length > 0 ? (
                                        <>
                                            <Box sx={[
                                                {
                                                    display: 'none'
                                                },
                                                (theme) => theme.applyStyles('dark', {
                                                    display: "block"
                                                })
                                            ]}>
                                                <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                    <rect width="60" height="60" rx="8" fill="#212121" />
                                                    <path d="M30.0001 21.7501V38.2501M38.25 30L21.75 30" stroke="#BDBDBD" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            </Box>
                                            <Box sx={[
                                                {
                                                    display: 'none'
                                                },
                                                (theme) => theme.applyStyles('light', {
                                                    display: "block"
                                                })
                                            ]}>
                                                <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                    <rect width="60" height="60" rx="8" fill="#EEEEEE" />
                                                    <path d="M30.0001 21.7501V38.2501M38.25 30L21.75 30" stroke="#757575" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            </Box>
                                        </>
                                    ) :
                                        <>
                                            <img src="/svg/Frame 587.svg" alt="upload-image" />
                                            <Typography variant="body1" sx={{ color: "marketplace.filterButtonText", mt: 1.5 }}>Upload a file or drag and drop here</Typography>
                                            <Typography variant="body2" sx={{ color: "#757575", ml: 2 }}>(png, jpeg)</Typography>
                                        </>
                                }
                            </Box>
                        )}
                    </Dropzone>
                </Box>
                {(categories.find(c => c.name === props.formData.assetType) ?? categories[0]).fields.map((field, index) => {
                    let fieldId = field.name.charAt(0).toLowerCase() + field.name.slice(1).replace(/\s+/g, '');
                    return field.type === "document" ? (
                        <Box key={index}>
                            <Typography variant="subtitle1" sx={{ color: "marketplace.filterButtonText", mt: 3 }}>Add documents</Typography>
                            <Typography sx={{ color: "#757575", fontSize: "12px" }}>Add documents for asset {field.name.toLowerCase()}</Typography>
                            <Box sx={{ mt: 2 }}>
                                {props.documents[fieldId]?.map((document, index) => (
                                    <Box key={index} sx={{ display: "flex", gap: 1, alignItems: "center", mb: 2 }}>
                                        <Box sx={[
                                            {
                                                display: 'none'
                                            },
                                            (theme) => theme.applyStyles('dark', {
                                                display: "block"
                                            })
                                        ]}>
                                            <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <rect width="60" height="60" rx="8" fill="#212121" />
                                                <path fillRule="evenodd" clipRule="evenodd" d="M35 32L35 24C35 21.7909 33.2091 20 31 20H28.6569C28.3491 20 28.045 20.0355 27.75 20.1041L27.75 22C27.75 24.6234 25.6234 26.75 23 26.75H21.1041C21.0355 27.045 21 27.3491 21 27.6569V32C21 34.2091 22.7909 36 25 36H31C33.2091 36 35 34.2091 35 32ZM25.8284 21.1716C25.961 21.039 26.102 20.9167 26.25 20.8051L26.25 22C26.25 23.7949 24.7949 25.25 23 25.25H21.8051C21.9167 25.102 22.039 24.961 22.1716 24.8284L25.8284 21.1716ZM29 40C27.3213 40 25.8842 38.9659 25.2908 37.5H31C34.0376 37.5 36.5 35.0376 36.5 32V24.2908C37.9659 24.8842 39 26.3213 39 28V36C39 38.2092 37.2092 40 35 40H29Z" fill="white" />
                                            </svg>
                                        </Box>
                                        <Box sx={[
                                            {
                                                display: 'none'
                                            },
                                            (theme) => theme.applyStyles('light', {
                                                display: "block"
                                            })
                                        ]}>
                                            <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <rect width="60" height="60" rx="8" fill="#EEEEEE" />
                                                <path fillRule="evenodd" clipRule="evenodd" d="M35 32L35 24C35 21.7909 33.2091 20 31 20H28.6569C28.3491 20 28.045 20.0355 27.75 20.1041L27.75 22C27.75 24.6234 25.6234 26.75 23 26.75H21.1041C21.0355 27.045 21 27.3491 21 27.6569V32C21 34.2091 22.7909 36 25 36H31C33.2091 36 35 34.2091 35 32ZM25.8284 21.1716C25.961 21.039 26.102 20.9167 26.25 20.8051L26.25 22C26.25 23.7949 24.7949 25.25 23 25.25H21.8051C21.9167 25.102 22.039 24.961 22.1716 24.8284L25.8284 21.1716ZM29 40C27.3213 40 25.8842 38.9659 25.2908 37.5H31C34.0376 37.5 36.5 35.0376 36.5 32V24.2908C37.9659 24.8842 39 26.3213 39 28V36C39 38.2092 37.2092 40 35 40H29Z" fill="#9E9E9E" />
                                            </svg>
                                        </Box>
                                        <Box>
                                            <Typography variant="body1" sx={{ color: "marketplace.filterButtonText", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{typeof document === 'string' ? decodeURIComponent(document).split('?')[0].split('/').pop() : document.name}</Typography>
                                            <Typography
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    props.setDocuments({ ...props.documents, [fieldId]: props.documents[fieldId].filter((_: any, i: number) => i !== index) })
                                                }}
                                                sx={{ color: "marketplace.filterButtonText", fontSize: '12px', cursor: "pointer" }}>Remove the document</Typography>
                                        </Box>
                                    </Box>
                                ))}
                                <Dropzone
                                    accept={{ 'application/pdf': ['.pdf'], 'application/msword': ['.doc'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] }}
                                    multiple={true}
                                    onDrop={acceptedFiles => {
                                        props.setError("");

                                        if (acceptedFiles.some(file => !file.size || file.size > 5 * 1024 * 1024)) {
                                            props.setError("File size should be less than 5MB");
                                            return;
                                        }
                                        if (acceptedFiles.length > 5) {
                                            props.setError("You can only upload 5 documents");
                                            return;
                                        }

                                        if (props.documents[fieldId]) {
                                            props.setDocuments({ ...props.documents, [fieldId]: [...props.documents[fieldId], ...acceptedFiles] })
                                        }
                                        else {
                                            props.setDocuments({ ...props.documents, [fieldId]: acceptedFiles })
                                        }
                                    }}>
                                    {({ getRootProps, getInputProps, open }) => (
                                        <Box {...getRootProps()} onClick={open} sx={{ border: !props.documents[fieldId] || props.documents[fieldId]?.length === 0 ? "1px dashed #424242" : "", borderRadius: "10px", p: props.documents[fieldId]?.length ? 0 : 2, display: "flex", flexDirection: "column", alignItems: props.documents[fieldId]?.length ? "left" : "center", cursor: "pointer" }}>
                                            <input {...getInputProps()} />
                                            {props.documents[fieldId]?.length > 0 ?
                                                <>
                                                    <Box sx={[
                                                        {
                                                            display: 'none'
                                                        },
                                                        (theme) => theme.applyStyles('dark', {
                                                            display: "block"
                                                        })
                                                    ]}>
                                                        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                            <rect width="60" height="60" rx="8" fill="#212121" />
                                                            <path d="M30.0001 21.7501V38.2501M38.25 30L21.75 30" stroke="#BDBDBD" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                                                        </svg>
                                                    </Box>
                                                    <Box sx={[
                                                        {
                                                            display: 'none'
                                                        },
                                                        (theme) => theme.applyStyles('light', {
                                                            display: "block"
                                                        })
                                                    ]}>
                                                        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                            <rect width="60" height="60" rx="8" fill="#EEEEEE" />
                                                            <path d="M30.0001 21.7501V38.2501M38.25 30L21.75 30" stroke="#757575" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                                                        </svg>
                                                    </Box>
                                                </>
                                                :
                                                <>
                                                    <img src="/svg/Frame 589.svg" alt="upload-image" />
                                                    <Typography variant="body1" sx={{ color: "marketplace.filterButtonText", mt: 1.5 }}>Upload a file or drag and drop here</Typography>
                                                    <Typography variant="body2" sx={{ color: "#757575", ml: 2 }}>(pdf, doc)</Typography>
                                                </>
                                            }
                                        </Box>
                                    )}
                                </Dropzone>
                            </Box>
                        </Box>
                    ) : null
                })}
                <Box sx={{ mt: 4, display: 'flex', alignItems: 'center' }}>
                    <Checkbox
                        checked={props.formData.userKycRequired}
                        onChange={(e) => props.setFormData({ ...props.formData, userKycRequired: e.target.checked })}
                        color="primary"
                        sx={{
                            color: 'navbar.primary',
                            '&.Mui-checked': {
                                color: '#C6FF00',
                            },
                        }}
                        inputProps={{ 'aria-label': 'controlled' }}
                    />
                    <Typography variant="subtitle1" sx={{ color: "marketplace.filterButtonText" }}>User KYC required</Typography>
                </Box>
                <Button disableElevation onClick={props.onSubmit} variant="contained" sx={{ border: 1, borderColor: "marketplace.searchButtonBorder", backgroundColor: 'marketplace.viewMoreButtonBackground', color: 'navbar.primary', borderRadius: 5, px: 3, py: 1, mt: 4.5, width: "100%", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                    {props.update ? "Update the asset" : "Mint & List Preview"}
                    {props.isPending && props.error.trim() === "" && <CircularProgress size={20} sx={{ color: "#FAFAFA" }} />}
                </Button>
            </Box>
        </Box >
    )
}