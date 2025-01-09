"use client";

import axios from "axios";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";

const ReviewPage: React.FC = () => {
    const [imageIndex, setImageIndex] = useState<number>(0);
    const [imageUrl, setImageUrl] = useState<string>("");
    const [metadata, setMetadata] = useState<Record<string, any> | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const router = useRouter();
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

    // Fetch metadata for the current image index
    const fetchMetadata = async (index: number) => {
        setLoading(true);
        setError(null);
        try {
            const response = await axios.get(`${apiUrl}/api/review/metadata`, {
                params: { image_index: index },
            });
            if (response.data.status === "complete") {
                alert("All images reviewed!");
                router.push("/review/complete");
            } else {
                setImageUrl(response.data.image_url);
                setMetadata(response.data.metadata);
                setImageIndex(index);
            }
        } catch (err) {
            console.error("Error fetching metadata:", err);
            setError("Error loading metadata. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    // Submit the current review
    const handleSubmit = async (e?: React.FormEvent<HTMLFormElement> | null) => {
        if (e) e.preventDefault(); // Prevent default form submission

        try {
            const formElement = document.getElementById("review-form") as HTMLFormElement | null;

            if (!formElement) {
                throw new Error("Form element not found in the DOM.");
            }

            const formData = new FormData(formElement);

            const response = await axios.post(`${apiUrl}/api/review/metadata`, formData);
            fetchMetadata(response.data.next_image); // Fetch the next image
        } catch (err) {
            console.error("Error submitting review:", err);
            setError("Error submitting review. Please try again.");
        }
    };

    // Handle the space bar for quick navigation
    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === " ") {
            event.preventDefault(); // Prevent default scrolling behavior
            console.log("Spacebar pressed. Submitting form...");
            handleSubmit(null); // Trigger form submission
        }
    };

    // Attach and detach the keydown listener
    useEffect(() => {
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [imageIndex]);

    // Fetch metadata on component mount
    useEffect(() => {
        fetchMetadata(imageIndex);
    }, []);

    if (loading) return <p>Loading...</p>;
    if (error) return <p style={{ color: "red" }}>{error}</p>;

    return (
        <div style={{ fontFamily: "Arial, sans-serif", margin: "20px" }}>
            <h1 style={{ textAlign: "center", marginBottom: "20px" }}>Review Metadata</h1>
            <div style={{ textAlign: "center", marginBottom: "20px" }}>
                {imageUrl && (
                    <img
                        src={imageUrl}
                        alt="Review"
                        style={{
                            display: "block", // Treat the image as a block-level element
                            margin: "0 auto", // Center the image horizontally
                            maxWidth: "100%",
                            maxHeight: "500px",
                            borderRadius: "10px",
                            boxShadow: "0 4px 8px rgba(0, 0, 0, 0.1)",
                        }}
                    />
                )}
            </div>
            <form
                id="review-form"
                onSubmit={handleSubmit}
                style={{ maxWidth: "600px", margin: "0 auto", textAlign: "left" }}
            >
                <input type="hidden" name="image_index" value={imageIndex} />
                <div style={{ marginBottom: "20px" }}>
                    {metadata &&
                        Object.entries(metadata)
                            .filter(([key, value]) => value !== null && value !== undefined && value !== "")
                            .map(([key, value]) => (
                                <p key={key} style={{ margin: "5px 0" }}>
                                    <strong style={{ textTransform: "capitalize" }}>{key}:</strong> {value}
                                </p>
                            ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
                    <label>
                        <input type="checkbox" name="incorrect_color" /> Incorrect Color
                    </label>
                    <label>
                        <input type="checkbox" name="incorrect_brand" /> Incorrect Brand
                    </label>
                    <label>
                        <input type="checkbox" name="incorrect_material" /> Incorrect Material
                    </label>
                    <label>
                        <input type="checkbox" name="incorrect_shape" /> Incorrect Shape
                    </label>
                    <label>
                        <input type="checkbox" name="incorrect_modifiers" /> Incorrect Modifiers
                    </label>
                </div>
                <div style={{ textAlign: "center" }}>
                    <button
                        type="submit"
                        style={{
                            backgroundColor: "#4CAF50",
                            color: "white",
                            border: "none",
                            padding: "10px 20px",
                            borderRadius: "5px",
                            cursor: "pointer",
                            fontSize: "16px",
                            marginRight: "10px",
                        }}
                    >
                        Next
                    </button>
                    <button
                        type="button"
                        onClick={() => router.push("/review/complete")}
                        style={{
                            backgroundColor: "#f44336",
                            color: "white",
                            border: "none",
                            padding: "10px 20px",
                            borderRadius: "5px",
                            cursor: "pointer",
                            fontSize: "16px",
                        }}
                    >
                        Finish
                    </button>
                </div>
            </form>
        </div>
    );
};

export default ReviewPage;
