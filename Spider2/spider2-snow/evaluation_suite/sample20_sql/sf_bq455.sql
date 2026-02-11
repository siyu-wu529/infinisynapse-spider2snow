SELECT 
    SeriesInstanceUID,
    SeriesNumber,
    PatientID,
    instance_size AS series_size_mib
FROM IDC_IDC_V17_DICOM_ALL
WHERE Modality = 'CT'
    AND collection_id != 'nlst'
    AND ImageType NOT LIKE '%LOCALIZER%'
    AND TransferSyntaxUID NOT IN ('1.2.840.10008.1.2.4.70', '1.2.840.10008.1.2.4.51')
GROUP BY SeriesInstanceUID, SeriesNumber, PatientID, instance_size
HAVING COUNT(DISTINCT ImageOrientationPatient) = 1
    AND COUNT(DISTINCT PixelSpacing) = 1
    AND COUNT(DISTINCT Rows) = 1
    AND COUNT(DISTINCT Columns) = 1
    AND COUNT(DISTINCT Exposure) = 1
    AND COUNT(ImagePositionPatient) = COUNT(DISTINCT ImagePositionPatient)
ORDER BY instance_size DESC
LIMIT 5