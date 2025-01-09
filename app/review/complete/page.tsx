"use client";

import axios from "axios";
import React, { useEffect, useState } from "react";

const ReviewComplete: React.FC = () => {
    const [uploadStatus, setUploadStatus] = useState<string>("Uploading results...");
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

    useEffect(() => {
        // Trigger the /complete endpoint on mount
        const completeReview = async () => {
            try {
                const response = await axios.post(`${apiUrl}/api/review/metadata/complete`);
                if (response.data.status === "success") {
                    setUploadStatus("Results have been successfully uploaded to S3.");
                } else {
                    setUploadStatus("No reviews to upload.");
                }
            } catch (error) {
                console.error("Error completing the review:", error);
                setUploadStatus("Failed to upload results. Please try again.");
            }
        };

        completeReview();
    }, [apiUrl]);

    return (
        <div style={{ fontFamily: "Arial, sans-serif", margin: "20px", textAlign: "center" }}>
            <h1 style={{ marginBottom: "20px" }}>Review Complete!</h1>
            <p
                style={{
                    fontSize: "16px",
                    color: uploadStatus.includes("successfully") ? "green" : "red",
                }}
            >
                {uploadStatus}
            </p>
        </div>
    );
};

export default ReviewComplete;
