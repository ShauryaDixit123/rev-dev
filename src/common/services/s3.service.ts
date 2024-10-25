import { Injectable } from "@nestjs/common";
import { S3 } from "aws-sdk";
import { ConfigService } from "@nestjs/config";

interface signedURLParams {
  path: string;
  mimeType: string;
  bucket?: string;
}

@Injectable()
export class S3Service {
  s3: S3 = undefined;
  constructor(private readonly configService: ConfigService) {
    this.s3 = new S3({
      region: this.configService.get("AWS_S3_REGION"),
      credentials: {
        accessKeyId: this.configService.get("AWS_S3_ACCESS_KEY"),
        secretAccessKey: this.configService.get("AWS_S3_SECRET_KEY"),
      },
      signatureVersion: "v4",
    });
  }
  async getPresignedURLForUpload(params: signedURLParams) {
    const {
      path,
      mimeType,
      bucket = this.configService.get("AWS_S3_BUCKET_NAME"),
    } = params;
    const signedUrl: string = await this.s3.getSignedUrlPromise("putObject", {
      ACL: "public-read",
      Bucket: bucket,
      Key: path,
      Expires: 24 * 3600,
      ContentType: mimeType,
    });
    return signedUrl;
  }
  async getPresignedURL(params: signedURLParams) {
    const {
      path,
      mimeType,
      bucket = this.configService.get("AWS_S3_BUCKET_NAME"),
    } = params;
    const signedUrl: string = await this.s3.getSignedUrlPromise("getObject", {
      Bucket: bucket,
      Key: path,
      Expires: 24 * 3600,
      ResponseContentType: mimeType,
    });
    return signedUrl;
  }

  async uploadBlobToS3(params: { s3Path: string; blob: ArrayBuffer }) {
    const { s3Path, blob } = params;
    const bucket = this.configService.get("AWS_S3_BUCKET_NAME");
    await this.s3.upload({
      ACL: "public-read",
      Bucket: bucket,
      Key: s3Path,
      Body: blob,
    });
  }
}
