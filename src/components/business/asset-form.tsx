"use client";

import { Box, Checkbox, MenuItem, TextField, Typography } from "@mui/material";
import Dropzone from "react-dropzone";
import Image from "next/image";
import {
    type AssetFormValues,
    type CategoryDto,
    defaultDynamicValues,
    pricePerFraction,
} from "@/components/business/types";

const textFieldStyle = {
    input: { color: "marketplace.filterButtonText" },
    "& .MuiInput-root": {
        "&:before": { borderColor: "#424242" },
        "&:after": { borderColor: "#424242" },
        ":hover:not(.Mui-focused)": {
            "&:before": { borderColor: "#424242" },
        },
    },
};

const inputLabelProps = { style: { color: "#9E9E9E" } };

function toDateInputValue(bound?: number): string | undefined {
    return bound !== undefined ? new Date(bound).toISOString().split("T")[0] : undefined;
}

/**
 * Controlled, schema-driven listing form. Categories come from the server
 * (asset_categories rows parsed into FieldSpec[]), the parent owns the values
 * and the submit buttons.
 */
export default function AssetForm(props: {
    categories: CategoryDto[];
    values: AssetFormValues;
    onChange: (values: AssetFormValues) => void;
    /** Update mode: category and fraction count are immutable after mint. */
    lockStructure?: boolean;
    error: string;
    setError: (error: string) => void;
}) {
    const { categories, values, onChange } = props;
    const category = categories.find((c) => c.id === values.categoryId) ?? categories[0];

    const setField = (patch: Partial<AssetFormValues>) => onChange({ ...values, ...patch });
    const setDynamic = (key: string, value: string | number) =>
        onChange({ ...values, dynamic: { ...values.dynamic, [key]: value } });

    const changeCategory = (categoryId: string) => {
        const next = categories.find((c) => c.id === categoryId);
        if (!next) { return; }
        onChange({
            ...values,
            categoryId: next.id,
            dynamic: defaultDynamicValues(next),
            images: [],
            documents: {},
        });
    };

    if (!category) {
        return (
            <Typography variant="subtitle1" sx={{ color: "marketplace.filterButtonText", textAlign: "center", py: 6 }}>
                No asset categories are available yet. Please try again later.
            </Typography>
        );
    }

    const perFraction = values.valuation > 0 && values.fractions > 0
        ? pricePerFraction(values.valuation, values.fractions)
        : "";

    return (
        <Box>
            <TextField
                fullWidth
                select
                slotProps={{ input: { readOnly: props.lockStructure } }}
                label="Asset Type"
                variant="standard"
                value={category.id}
                onChange={(e) => changeCategory(e.target.value)}
                InputLabelProps={inputLabelProps}
                sx={{ ...textFieldStyle, mt: 2 }}
            >
                {categories.map((option) => (
                    <MenuItem key={option.id} value={option.id} sx={{ color: "marketplace.filterButtonText" }}>
                        {option.name}
                    </MenuItem>
                ))}
            </TextField>
            <TextField
                fullWidth
                label="Title"
                variant="standard"
                value={values.title}
                onChange={(e) => setField({ title: e.target.value })}
                InputLabelProps={inputLabelProps}
                sx={{ ...textFieldStyle, mt: 2 }}
            />
            <TextField
                fullWidth
                multiline
                rows={3}
                label="Description"
                variant="standard"
                value={values.description}
                onChange={(e) => setField({ description: e.target.value })}
                InputLabelProps={inputLabelProps}
                sx={{ ...textFieldStyle, mt: 2 }}
            />
            {category.fields.map((field) => {
                const value = values.dynamic[field.key] ?? "";
                if (field.type === "string" || field.type === "textArea") {
                    return (
                        <TextField
                            key={field.key}
                            fullWidth
                            multiline={field.type === "textArea"}
                            rows={field.type === "textArea" ? 3 : undefined}
                            label={field.name}
                            variant="standard"
                            value={value}
                            onChange={(e) => setDynamic(field.key, e.target.value)}
                            InputLabelProps={inputLabelProps}
                            sx={{ ...textFieldStyle, mt: 2 }}
                        />
                    );
                }
                if (field.type === "number") {
                    const numberValue = typeof value === "number" ? value : 0;
                    const belowMin = field.min !== undefined && numberValue < field.min;
                    const aboveMax = field.max !== undefined && numberValue > field.max;
                    return (
                        <TextField
                            key={field.key}
                            fullWidth
                            label={field.name}
                            variant="standard"
                            value={numberValue}
                            onChange={(e) => {
                                if (e.target.value === "") {
                                    setDynamic(field.key, 0);
                                } else if (Number(e.target.value) > 0) {
                                    setDynamic(field.key, Number(e.target.value));
                                }
                            }}
                            error={belowMin || aboveMax}
                            helperText={belowMin ? `Minimum value is ${field.min}` : aboveMax ? `Maximum value is ${field.max}` : ""}
                            InputLabelProps={inputLabelProps}
                            sx={{ ...textFieldStyle, mt: 2 }}
                        />
                    );
                }
                if (field.type === "dropdown") {
                    return (
                        <TextField
                            key={field.key}
                            fullWidth
                            select
                            label={field.name}
                            variant="standard"
                            value={value}
                            onChange={(e) => setDynamic(field.key, e.target.value)}
                            InputLabelProps={inputLabelProps}
                            sx={{ ...textFieldStyle, mt: 2 }}
                        >
                            {field.options?.map((option) => (
                                <MenuItem key={option} value={option} sx={{ color: "marketplace.filterButtonText" }}>
                                    {option}
                                </MenuItem>
                            ))}
                        </TextField>
                    );
                }
                if (field.type === "date") {
                    return (
                        <TextField
                            key={field.key}
                            fullWidth
                            label={field.name}
                            variant="standard"
                            type="date"
                            value={value}
                            onChange={(e) => setDynamic(field.key, e.target.value)}
                            InputLabelProps={{ ...inputLabelProps, shrink: true }}
                            sx={{ ...textFieldStyle, mt: 2 }}
                            InputProps={{
                                inputProps: {
                                    min: toDateInputValue(field.min),
                                    max: toDateInputValue(field.max),
                                },
                            }}
                        />
                    );
                }
                return null;
            })}
            <TextField
                fullWidth
                label="Valuation (USD)"
                variant="standard"
                value={values.valuation}
                onChange={(e) => {
                    if (e.target.value === "") {
                        setField({ valuation: 0 });
                    } else if (Number(e.target.value) > 0 && Number(e.target.value) <= 1000000000) {
                        setField({ valuation: Number(e.target.value) });
                    }
                }}
                InputLabelProps={inputLabelProps}
                sx={{ ...textFieldStyle, mt: 2 }}
            />
            <TextField
                fullWidth
                slotProps={{ input: { readOnly: props.lockStructure } }}
                label="Amounts of Fractions"
                variant="standard"
                value={values.fractions}
                onChange={(e) => {
                    if (e.target.value === "") {
                        setField({ fractions: 0 });
                    } else if (Number(e.target.value) > 0) {
                        setField({ fractions: Math.floor(Number(e.target.value)) });
                    }
                }}
                InputLabelProps={inputLabelProps}
                sx={{ ...textFieldStyle, mt: 2 }}
            />
            <TextField
                fullWidth
                label="Price per Fraction"
                slotProps={{ input: { readOnly: true } }}
                variant="standard"
                value={perFraction}
                InputLabelProps={inputLabelProps}
                sx={{ ...textFieldStyle, mt: 2 }}
            />

            <Typography variant="subtitle1" sx={{ color: "marketplace.filterButtonText", mt: 3 }}>Add photos of your asset</Typography>
            <Typography sx={{ color: "#757575", fontSize: "12px" }}>The first image uploaded will also be the cover showed in the marketplace card</Typography>
            <Box sx={{ display: values.images.length ? "flex" : "block", gap: 1, flexWrap: "wrap", mt: 2 }}>
                {values.images.map((image, index) => (
                    <Box key={index} sx={{ position: "relative", width: 60, height: 60 }}>
                        <Image src={typeof image === "string" ? image : URL.createObjectURL(image)} alt="asset" width={0} height={0} sizes="100vw" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10 }} />
                        <Box
                            onClick={(e) => {
                                e.stopPropagation();
                                setField({ images: values.images.filter((_, i) => i !== index) });
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
                    accept={{ "image/png": [".png"], "image/jpeg": [".jpeg", ".jpg"] }}
                    multiple={true}
                    onDrop={(acceptedFiles) => {
                        props.setError("");
                        if (acceptedFiles.some((file) => !file.size || file.size > 5 * 1024 * 1024)) {
                            props.setError("File size should be less than 5MB");
                            return;
                        }
                        if (values.images.length + acceptedFiles.length > 6) {
                            props.setError("You can only upload 6 images");
                            return;
                        }
                        setField({
                            images: [
                                ...values.images.filter((image) => !acceptedFiles.some((file) => typeof image === "string" ? file.name === image : file.name === image.name)),
                                ...acceptedFiles,
                            ],
                        });
                    }}
                >
                    {({ getRootProps, getInputProps, open }) => (
                        <Box {...getRootProps()} onClick={open} sx={{ border: values.images.length === 0 ? "1px dashed #424242" : "", borderRadius: "10px", p: values.images.length === 0 ? 2 : 0, display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer" }}>
                            <input {...getInputProps()} />
                            {values.images.length > 0 ? (
                                <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <rect width="60" height="60" rx="8" fill="#212121" />
                                    <path d="M30.0001 21.7501V38.2501M38.25 30L21.75 30" stroke="#BDBDBD" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            ) : (
                                <>
                                    <img src="/svg/Frame 587.svg" alt="upload" />
                                    <Typography variant="body1" sx={{ color: "marketplace.filterButtonText", mt: 1.5 }}>Upload a file or drag and drop here</Typography>
                                    <Typography variant="body2" sx={{ color: "#757575", ml: 2 }}>(png, jpeg)</Typography>
                                </>
                            )}
                        </Box>
                    )}
                </Dropzone>
            </Box>

            {category.fields.map((field) => {
                if (field.type !== "document") { return null; }
                const files = values.documents[field.key] ?? [];
                return (
                    <Box key={field.key}>
                        <Typography variant="subtitle1" sx={{ color: "marketplace.filterButtonText", mt: 3 }}>Add documents</Typography>
                        <Typography sx={{ color: "#757575", fontSize: "12px" }}>Add documents for asset {field.name.toLowerCase()}</Typography>
                        <Box sx={{ mt: 2 }}>
                            {files.map((document, index) => (
                                <Box key={index} sx={{ display: "flex", gap: 1, alignItems: "center", mb: 2 }}>
                                    <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <rect width="60" height="60" rx="8" fill="#212121" />
                                        <path fillRule="evenodd" clipRule="evenodd" d="M35 32L35 24C35 21.7909 33.2091 20 31 20H28.6569C28.3491 20 28.045 20.0355 27.75 20.1041L27.75 22C27.75 24.6234 25.6234 26.75 23 26.75H21.1041C21.0355 27.045 21 27.3491 21 27.6569V32C21 34.2091 22.7909 36 25 36H31C33.2091 36 35 34.2091 35 32ZM25.8284 21.1716C25.961 21.039 26.102 20.9167 26.25 20.8051L26.25 22C26.25 23.7949 24.7949 25.25 23 25.25H21.8051C21.9167 25.102 22.039 24.961 22.1716 24.8284L25.8284 21.1716ZM29 40C27.3213 40 25.8842 38.9659 25.2908 37.5H31C34.0376 37.5 36.5 35.0376 36.5 32V24.2908C37.9659 24.8842 39 26.3213 39 28V36C39 38.2092 37.2092 40 35 40H29Z" fill="white" />
                                    </svg>
                                    <Box>
                                        <Typography variant="body1" sx={{ color: "marketplace.filterButtonText", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                                            {typeof document === "string" ? decodeURIComponent(document).split("?")[0].split("/").pop() : document.name}
                                        </Typography>
                                        <Typography
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setField({ documents: { ...values.documents, [field.key]: files.filter((_, i) => i !== index) } });
                                            }}
                                            sx={{ color: "marketplace.filterButtonText", fontSize: "12px", cursor: "pointer" }}
                                        >
                                            Remove the document
                                        </Typography>
                                    </Box>
                                </Box>
                            ))}
                            <Dropzone
                                accept={{
                                    "application/pdf": [".pdf"],
                                    "application/msword": [".doc"],
                                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
                                }}
                                multiple={true}
                                onDrop={(acceptedFiles) => {
                                    props.setError("");
                                    if (acceptedFiles.some((file) => !file.size || file.size > 5 * 1024 * 1024)) {
                                        props.setError("File size should be less than 5MB");
                                        return;
                                    }
                                    if (files.length + acceptedFiles.length > 5) {
                                        props.setError("You can only upload 5 documents");
                                        return;
                                    }
                                    setField({ documents: { ...values.documents, [field.key]: [...files, ...acceptedFiles] } });
                                }}
                            >
                                {({ getRootProps, getInputProps, open }) => (
                                    <Box {...getRootProps()} onClick={open} sx={{ border: files.length === 0 ? "1px dashed #424242" : "", borderRadius: "10px", p: files.length ? 0 : 2, display: "flex", flexDirection: "column", alignItems: files.length ? "flex-start" : "center", cursor: "pointer" }}>
                                        <input {...getInputProps()} />
                                        {files.length > 0 ? (
                                            <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <rect width="60" height="60" rx="8" fill="#212121" />
                                                <path d="M30.0001 21.7501V38.2501M38.25 30L21.75 30" stroke="#BDBDBD" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        ) : (
                                            <>
                                                <img src="/svg/Frame 589.svg" alt="upload" />
                                                <Typography variant="body1" sx={{ color: "marketplace.filterButtonText", mt: 1.5 }}>Upload a file or drag and drop here</Typography>
                                                <Typography variant="body2" sx={{ color: "#757575", ml: 2 }}>(pdf, doc)</Typography>
                                            </>
                                        )}
                                    </Box>
                                )}
                            </Dropzone>
                        </Box>
                    </Box>
                );
            })}

            <Box sx={{ mt: 4, display: "flex", alignItems: "center" }}>
                <Checkbox
                    checked={values.kycRequired}
                    onChange={(e) => setField({ kycRequired: e.target.checked })}
                    color="primary"
                    sx={{
                        color: "navbar.primary",
                        "&.Mui-checked": { color: "#C6FF00" },
                    }}
                    inputProps={{ "aria-label": "controlled" }}
                />
                <Typography variant="subtitle1" sx={{ color: "marketplace.filterButtonText" }}>User KYC required</Typography>
            </Box>
        </Box>
    );
}
