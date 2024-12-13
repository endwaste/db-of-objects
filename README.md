# DB of Objects

### Move Crops from S3 to Google Drive

This section explains how to move images (crops) from the S3 folder `s3://glacier-ml-training/universal-db/crops/` to a folder in Google Drive. While you can use any method you prefer, one option is to use the method `rclone`.


### Using `rclone` to Move Crops
To use `rclone`, first install it on your Linux machine:

```bash
sudo apt install rclone
```
Copy the `rclone.conf` file to your rclone configuration location.

```bash
cp generate_crops/rclone.conf ~/.config/rclone/rclone.conf
```
The shared config file does not include the token for Google Drive. You must authenticate your Google Drive account:

```bash
rclone config reconnect gdrive:
```
Follow the on-screen instructions: open the provided link in a browser and log in with your Google account.
Also, make sure your AWS credentials are stored in your `~/.aws/credentials` file. 

To move the images from the S3 folder `s3://glacier-ml-training/universal-db/crops/` to your Google Drive folder, use the following command:

```bash
rclone copy s3:glacier-ml-training/universal-db/crops gdrive:"CROPS for UID" -P
```
Replace "CROPS for UID" with the name of the folder in your Google Drive where you want the crops to be uploaded.

