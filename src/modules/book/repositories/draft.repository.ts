import { Injectable } from "@nestjs/common";
import { DbClient } from "src/common/services/dbclient.service";
import {
  addBookDraftPageI,
  addBookManuscriptBodyI,
} from "../interfaces/draft.interface";

@Injectable()
export class DraftRepository {
  constructor(private readonly dbClient: DbClient) {}
  async addBookManuscript(body: addBookManuscriptBodyI) {
    return this.dbClient.bookStageManuscript.create({
      data: { ...body },
    });
  }
  async getBookDetailsByBkStgId(params: { id: string }) {
    return this.dbClient.bookStage.findFirst({
      where: { id: params.id },
      include: {
        Book: {},
        BookStageImageMap: {},
        BookStageManuscript: {},
      },
    });
  }
  async getBookDetailsByStage(params: { bookId: string; stageId: number }) {
    return this.dbClient.bookStage.findFirst({
      where: { bookId: params.bookId, stageId: params.stageId },
      include: {
        Book: {},
        BookStageImageMap: {},
        BookStageManuscript: {},
      },
    });
  }
  async addBookStageManuscriptPages(params: addBookDraftPageI[]) {
    return this.dbClient.bookStageManuscriptPage.createMany({
      data: params,
    });
  }
  async addBookStageManuscriptPage(params: addBookDraftPageI) {
    return this.dbClient.bookStageManuscriptPage.create({
      data: params,
    });
  }
  async getManuscriptPage(params: { bkStgManuId: string; page: number }) {
    return this.dbClient.bookStageManuscriptPage.findFirst({
      where: { bkStgManuId: params.bkStgManuId, page: params.page },
    });
  }
  async getBookStageManucriptById(params: { id: string }) {
    return this.dbClient.bookStageManuscript.findFirst({
      where: { ...params },
      include: { BookStage: {} },
    });
  }
  async getBookManuscriptsBkStgId(params: { bkStgId: string }) {
    return this.dbClient.bookStageManuscript.findMany({
      where: params,
    });
  }
  async deleteBookManuscriptPage(params: { bkManuId: string; page: number }) {
    return this.dbClient.bookStageManuscriptPage.delete({
      where: {
        page_bkStgManuId: { bkStgManuId: params.bkManuId, page: params.page },
      },
    });
  }
  async getFinalManuscriptForStage(params: {
    bookId: string;
    stageId: number;
  }) {
    return this.dbClient.bookStage.findFirst({
      where: params,
      include: {
        BookStageManuscript: {
          where: {
            isAccepted: true,
            isSubmitted: true,
          },
        },
      },
    });
  }
  async getOGManuscriptPageCountByStageId(params: { bkStgId: string }) {
    return this.dbClient.bookStageManuscriptPage.count({
      where: {
        BookStageManuscript: {
          bkStgId: params.bkStgId,
          parentId: null,
        },
      },
    });
  }
}
