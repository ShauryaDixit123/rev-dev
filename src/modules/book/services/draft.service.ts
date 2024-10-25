import { Injectable } from "@nestjs/common";
import { S3Service } from "src/common/services/s3.service";
import { ImagesRepository } from "src/modules/project/repositories/image.repository";
import { uploadImageI } from "../interfaces/book.interface";
import axios from "axios";
import { convertToHtml } from "mammoth";
import fs from "fs";
import juice from "juice";
import * as htmlDocx from "html-docx-js";
import { ConfigService } from "@nestjs/config";
import { DraftRepository } from "../repositories/draft.repository";
import { BOOK_STAGE_TREE } from "../constants/stage";
import { DbExecptions } from "src/common/constants/status";
import { addBookDraftPageI } from "../interfaces/draft.interface";
import { ImageFormatInitNames } from "../constants/initNames";

@Injectable()
export class DraftService {
  constructor(
    private readonly imagesRepo: ImagesRepository,
    private readonly s3Service: S3Service,
    private readonly configService: ConfigService,
    private readonly draftRepo: DraftRepository
  ) {}
  async fetchPresignedForDraft(body: { bookId: string }) {
    const img = await this.imagesRepo.getDraftImage({
      id: body.bookId,
    });
    const s3Path = img.BookDraft.s3Path;
    const mimeType = img.BookDraft.mimeType;
    const signedURL = await this.s3Service.getPresignedURL({
      path: s3Path,
      mimeType,
    });
    return { signedURL };
  }
  async addBookDraftImage(body: uploadImageI) {
    const { s3Path, mimeType, title, uploadedBy } = body;
    const signedURL = await this.s3Service.getPresignedURLForUpload({
      path: s3Path,
      mimeType,
    });
    const doc = await this.imagesRepo.addImage({
      title,
      s3Path,
      mimeType,
      uploadedBy,
    });
    return { signedURL, doc };
  }
  async prepareDraft(body: {
    bookId: string;
    stageId: number;
    parentBkManuId?: string;
  }) {
    const { parentBkManuId, ...rest } = body;
    const bkStg = await this.draftRepo.getBookDetailsByStage(rest);
    const payload = {
      bkStgId: bkStg.id,
      name: ImageFormatInitNames.OG_MANUSCRIPT_NAME,
      isSubmitted: true,
      parentId: body.parentBkManuId ? body.parentBkManuId : null,
    };
    if (!body.parentBkManuId) {
      const { signedURL } = await this.fetchPresignedForDraft({
        bookId: bkStg.Book.id,
      });
      const res = await axios.get(signedURL, {
        responseType: "arraybuffer",
      });
      const draftBuf = Buffer.from(res.data);
      const mapped = await convertToHtml(
        {
          buffer: draftBuf,
        },
        {
          ignoreEmptyParagraphs: false,
        }
      );
      const bkM = await this.draftRepo.addBookManuscript(payload);
      const pgs = this.splitIntoPages({
        html: mapped.value,
      });
      const mpedPgs = pgs.map((pg, i) => {
        const obj: addBookDraftPageI = {
          content: pg,
          page: i,
          bkStgManuId: bkM.id,
        };
        return obj;
      });
      await this.draftRepo.addBookStageManuscriptPages(mpedPgs);
      return bkM;
    }
    return await this.draftRepo.addBookManuscript({
      ...payload,
      name: ImageFormatInitNames.OG_MANUSCRIPT_NAME,
    });
  }
  splitIntoPages(body: { html: string }): string[] {
    const { html } = body;
    const pageSize = this.configService.get("MAX_CHAR_PER_PAGE");
    const paragraphs = html.split("</p>");
    const pages = [];
    let currentPage = "";
    for (const paragraph of paragraphs) {
      if (currentPage.length + paragraph.length > pageSize) {
        pages.push(currentPage);
        currentPage = paragraph + "</p>";
      } else {
        currentPage += paragraph + "</p>";
      }
    }
    // Push the last page
    if (currentPage) {
      pages.push(currentPage);
    }
    return pages;
  }
  getBookStageId(params: { stage: string }) {
    const stgD = BOOK_STAGE_TREE.find((bk) => bk.stage === params.stage);
    if (!stgD) {
      throw DbExecptions.DOESNOT_EXISTS("stage");
    }
    return stgD;
  }
  async getRecursPageManuscript(body: { mid: string; page: number }) {
    const pgD = await this.draftRepo.getManuscriptPage({
      page: Number(body.page),
      bkStgManuId: body.mid,
    });
    if (pgD !== null) {
      return pgD;
    }
    const msD = await this.draftRepo.getBookStageManucriptById({
      id: body.mid,
    });
    return this.getRecursPageManuscript({
      mid: msD.parentId,
      page: body.page,
    });
  }
  async getOGManuscriptPageCount(body: { mid: string }) {
    const ms = await this.draftRepo.getBookStageManucriptById({
      id: body.mid,
    });
    return {
      count: await this.draftRepo.getOGManuscriptPageCountByStageId({
        bkStgId: ms.bkStgId,
      }),
      manuscript: ms,
    };
  }
  async convertHtmlToWord(htmlArray: string[]): Promise<void> {
    try {
      const inlinedHtmlArray = htmlArray.map((html) => juice(html));
      const combinedHtml = inlinedHtmlArray.join("<br>");
      return htmlDocx.asBlob(combinedHtml);
    } catch (error) {
      console.error("Error converting HTML to Word document:", error);
    }
  }
}
// post api for bk mansc; if issubm then create new manu or else start editing in it.
// get api for manusc by id
// get api for bkid and stg with all manu attched nd
